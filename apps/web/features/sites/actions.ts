"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getAdminClient } from "@/lib/supabase/admin"
import { getEveClient } from "@/lib/eve"
import { startAgentTask } from "@/lib/agent-tasks"
import {
  siteBriefSchema,
  type SiteActionState,
  type SiteBriefInput,
} from "@/features/sites/schemas"

/**
 * Cliente del agente eve. withEve monta las rutas /eve/v1/* en este mismo
 * deployment; en dev el canal acepta con localDev(). El host se puede
 * sobreescribir con EVE_HOST.
 *
 * En Vercel: host = URL de producción estable (VERCEL_URL apunta al deployment
 * protegido por Vercel Authentication y devuelve HTML de login), y auth = token
 * OIDC del proyecto — el canal lo acepta vía vercelOidc() sin configuración.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

export async function createSiteBrief(
  leadId: string,
  input: SiteBriefInput,
): Promise<SiteActionState> {
  const parsed = siteBriefSchema.safeParse(input)
  if (!parsed.success) {
    return { formError: "Brief inválido." }
  }

  const supabase = getAdminClient()

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, place_id, name, city, website, site_instructions")
    .eq("id", leadId)
    .maybeSingle()
  if (leadError || !lead) {
    return { formError: "Lead no encontrado." }
  }

  const slug = slugify(`${lead.name ?? lead.place_id}-${lead.city.split(",")[0]}`)

  const { data: site, error: insertError } = await supabase
    .from("sites")
    .insert({
      lead_id: leadId,
      slug,
      brief: parsed.data,
    })
    .select("id")
    .single()
  if (insertError) {
    // 23505 = unique violation: ya hay sitio para este lead.
    if (insertError.code === "23505") {
      return { formError: "Este lead ya tiene un sitio. Ábrelo en Sitios." }
    }
    return { formError: `No se pudo crear el sitio: ${insertError.message}` }
  }

  await supabase.from("lead_activity").insert({
    lead_id: leadId,
    type: "site_brief_created",
    note: `Brief creado para ${slug}${parsed.data.referenceSlug ? ` (referencia guía: ${parsed.data.referenceSlug})` : ""}.`,
    actor: "manual",
  })

  // Arranca la sesión del agente y responde de inmediato: la generación tarda
  // minutos y el progreso se refleja en la BDD (status del site).
  try {
    const eve = getEveClient()
    const session = eve.session()
    const response = await session.send(
      [
        `Genera el sitio web para el site ${site.id} (lead "${lead.name}", ${lead.city}).`,
        lead.website ? `Es un rediseño: el sitio actual es ${lead.website}.` : "",
        parsed.data.referenceSlug
          ? `Referencia guía elegida por el humano: ${parsed.data.referenceSlug} (prioriza su analysis).`
          : "",
        parsed.data.instructions
          ? `Instrucciones del brief: ${parsed.data.instructions}`
          : "",
        `Config del brief: tema=${parsed.data.themeMode}, WhatsApp flotante=${parsed.data.whatsappFloat ? "sí" : "no"}, formulario de contacto=${parsed.data.contactForm ? "sí" : "no"}.`,
        `Idiomas del sitio: ${parsed.data.locales.join(", ")} (el primero es el default en "/").`,
      ]
        .filter(Boolean)
        .join(" "),
    )
    await supabase
      .from("sites")
      .update({
        eve_session_id: response.continuationToken,
        eve_run_id: response.sessionId,
        eve_run_ids: [response.sessionId],
      })
      .eq("id", site.id)
    // Capa 0: registra la tarea (atribución + fila 'running' que el hook del
    // site-builder cerrará al terminar → campana/sonido/correo). Best-effort.
    await startAgentTask({
      sessionId: response.sessionId,
      kind: "site_build",
      title: `Sitio de ${lead.name ?? slug}`,
      subjectType: "site",
      subjectId: site.id,
      href: `/dashboard/sites/${site.id}`,
    })
  } catch (error) {
    // El brief quedó guardado; la generación se puede relanzar desde el detalle.
    await supabase
      .from("sites")
      .update({ status: "failed" })
      .eq("id", site.id)
    return {
      formError: `Brief guardado, pero no se pudo arrancar el agente: ${error instanceof Error ? error.message : "error desconocido"}`,
    }
  }

  revalidatePath("/dashboard/sites")
  redirect(`/dashboard/sites/${site.id}`)
}

/**
 * Follow-up a la sesión eve del sitio. Si el sitio no tiene sesión (p. ej.
 * falló al arrancar cuando se creó el brief), abre una sesión nueva y la guarda.
 */
async function sendFollowUp(
  siteId: string,
  message: string,
): Promise<SiteActionState> {
  const supabase = getAdminClient()
  const { data: site, error } = await supabase
    .from("sites")
    .select("id, slug, eve_session_id, eve_run_ids, leads(name)")
    .eq("id", siteId)
    .maybeSingle()
  if (error || !site) return { formError: "Sitio no encontrado." }

  try {
    const eve = getEveClient()
    const session = site.eve_session_id
      ? eve.session(site.eve_session_id)
      : eve.session()
    // SIEMPRE con contexto: los subagentes no ven la conversación del root y
    // sin el site_id se pierden ("¿me confirmas el siteId?"). El panel pela
    // este tag al renderizar, así que no ensucia la burbuja.
    const response = await session.send(`[Contexto: site ${siteId}] ${message}`)
    await supabase
      .from("sites")
      .update({
        // Cada send devuelve un token fresco; se guarda siempre el último.
        eve_session_id: response.continuationToken,
        eve_run_id: response.sessionId,
        eve_run_ids: [...(site.eve_run_ids ?? []), response.sessionId],
      })
      .eq("id", siteId)
    const leadName = (site.leads as { name?: string } | null)?.name
    await startAgentTask({
      sessionId: response.sessionId,
      kind: "site_build",
      title: `Sitio de ${leadName ?? site.slug ?? "cliente"}`,
      subjectType: "site",
      subjectId: siteId,
      href: `/dashboard/sites/${siteId}`,
    })
  } catch (err) {
    return {
      formError: `No se pudo contactar al agente: ${err instanceof Error ? err.message : "error desconocido"}`,
    }
  }

  revalidatePath(`/dashboard/sites/${siteId}`)
  return {}
}

/**
 * Stop COOPERATIVO de un sitio en proceso: lo marca `cancelled`. eve no
 * permite abortar el run en curso, pero el getSite del agente lanza en
 * cancelled — cualquier tool que toque el site aborta en su siguiente
 * llamada y el run muere en segundos (checkpoints de la rama v{N}
 * sobreviven). Retomar = pedir regenerar (cancelled → generating).
 */
export async function stopSite(siteId: string): Promise<SiteActionState> {
  const supabase = getAdminClient()
  const { data: site } = await supabase
    .from("sites")
    .select("id, status, lead_id")
    .eq("id", siteId)
    .maybeSingle()
  if (!site) return { formError: "Sitio no encontrado." }
  if (site.status !== "brief" && site.status !== "generating") {
    return { formError: "Solo se detiene un sitio en proceso." }
  }

  const { error } = await supabase
    .from("sites")
    .update({ status: "cancelled" })
    .eq("id", siteId)
  if (error) return { formError: error.message }

  await supabase.from("lead_activity").insert({
    lead_id: site.lead_id,
    type: "site_status_change",
    note: `${site.status} → cancelled: detenido manualmente desde el dashboard.`,
    actor: "manual",
  })

  revalidatePath(`/dashboard/sites/${siteId}`)
  return {}
}

export async function approveSite(siteId: string): Promise<SiteActionState> {
  const supabase = getAdminClient()
  const { data: site } = await supabase
    .from("sites")
    .select("id, status, lead_id")
    .eq("id", siteId)
    .maybeSingle()
  if (!site) return { formError: "Sitio no encontrado." }
  if (site.status !== "preview") {
    return { formError: "Solo se aprueba un sitio en preview." }
  }

  // Aprobar es acción humana directa en BDD; no pasa por el agente.
  const { error } = await supabase
    .from("sites")
    .update({ status: "approved" })
    .eq("id", siteId)
  if (error) return { formError: error.message }

  await supabase.from("lead_activity").insert({
    lead_id: site.lead_id,
    type: "site_approved",
    note: "Sitio aprobado desde el dashboard.",
    actor: "manual",
  })

  revalidatePath(`/dashboard/sites/${siteId}`)
  return {}
}

export async function publishSite(siteId: string): Promise<SiteActionState> {
  const supabase = getAdminClient()
  const { data: site } = await supabase
    .from("sites")
    .select("id, status, current_version")
    .eq("id", siteId)
    .maybeSingle()
  if (!site) return { formError: "Sitio no encontrado." }
  if (site.status !== "approved") {
    return { formError: "Aprueba el sitio antes de publicar." }
  }

  return sendFollowUp(
    siteId,
    `El humano aprobó y pidió publicar el site ${siteId}. Delega a site-builder (modo publish): publicar la versión v${site.current_version ?? 1} a producción.`,
  )
}

/**
 * Promueve una versión-rama concreta a producción. Sirve cuando hay varias
 * versiones en preview a la vez (p. ej. dos direcciones de diseño): el humano
 * elige cuál rama sube. Delega el merge + cambio de current_version al agente
 * (site-builder, modo publish), igual que publishSite pero con la versión elegida a mano.
 */
export async function publishSiteVersion(
  siteId: string,
  versionN: number,
): Promise<SiteActionState> {
  const supabase = getAdminClient()
  const { data: site } = await supabase
    .from("sites")
    .select("id, status, lead_id")
    .eq("id", siteId)
    .maybeSingle()
  if (!site) return { formError: "Sitio no encontrado." }
  if (site.status === "brief" || site.status === "generating") {
    return { formError: "Espera a que termine la generación." }
  }

  // La rama debe existir, tener preview (código subido) y qa_report — mismos
  // requisitos que exige publish_site: no se mergea a main algo sin QA.
  const { data: version } = await supabase
    .from("site_versions")
    .select("id, preview_url, qa_report")
    .eq("site_id", siteId)
    .eq("version_n", versionN)
    .maybeSingle()
  if (!version) return { formError: `No existe la versión v${versionN}.` }
  if (!version.preview_url) {
    return { formError: `La v${versionN} todavía no tiene preview.` }
  }
  if (!version.qa_report) {
    return { formError: `La v${versionN} no pasó QA todavía; no se puede publicar.` }
  }

  // publish_site exige status 'approved' (guard de acción irreversible).
  // Aprobar es decisión humana directa en BDD; deja el sitio listo para que
  // el agente mergee la RAMA ELEGIDA (no necesariamente la más reciente).
  const { error } = await supabase
    .from("sites")
    .update({ status: "approved" })
    .eq("id", siteId)
  if (error) return { formError: error.message }

  await supabase.from("lead_activity").insert({
    lead_id: site.lead_id,
    type: "site_approved",
    note: `Aprobación manual de v${versionN} para publicar desde el dashboard.`,
    actor: "manual",
  })

  return sendFollowUp(
    siteId,
    `El humano aprobó y pidió publicar la versión v${versionN} del site ${siteId} a producción. Había varias versiones en preview y eligió ESTA rama. Usa publish_site con versionN=${versionN} (merge de la rama v${versionN} a main → deployment de producción → published). Publica exactamente esa versión, aunque no sea la más reciente.`,
  )
}

/**
 * Responde un input request pendiente (pregunta HITL del agente). A diferencia
 * de un mensaje suelto, esto reanuda el turno pausado CON el contexto de la
 * pregunta — el agente recibe la respuesta donde la pidió.
 */
export async function answerSiteInput(
  siteId: string,
  requestId: string,
  text: string,
  questionPrompt?: string,
): Promise<SiteActionState> {
  const trimmed = text.trim()
  if (trimmed.length < 1) return { formError: "Escribe una respuesta." }

  const supabase = getAdminClient()
  const { data: site, error } = await supabase
    .from("sites")
    .select("id, eve_session_id, eve_run_ids")
    .eq("id", siteId)
    .maybeSingle()
  if (error || !site?.eve_session_id) {
    return { formError: "Sitio sin sesión de agente." }
  }

  try {
    const eve = getEveClient()
    const session = eve.session(site.eve_session_id)
    // El route exige `message` aunque viajen inputResponses. El mensaje cita
    // la pregunta: el root rutea la respuesta al subagente correcto sin
    // depender de su memoria del turno anterior.
    const quoted = questionPrompt?.trim()
      ? `Respondiendo a la pregunta pendiente («${questionPrompt.trim().slice(0, 180)}»): ${trimmed}`
      : trimmed
    const response = await session.send({
      // Contexto siempre: el subagente que retome necesita el site_id.
      message: `[Contexto: site ${siteId}] ${quoted}`,
      inputResponses: [{ requestId, text: trimmed }],
    })
    await supabase
      .from("sites")
      .update({
        eve_session_id: response.continuationToken,
        eve_run_id: response.sessionId,
        eve_run_ids: [...(site.eve_run_ids ?? []), response.sessionId],
      })
      .eq("id", siteId)
  } catch (err) {
    return {
      formError: `No se pudo responder al agente: ${err instanceof Error ? err.message : "error desconocido"}`,
    }
  }

  revalidatePath(`/dashboard/sites/${siteId}`)
  return {}
}

/** Mensaje libre del humano a la sesión del sitio (desde el panel de actividad). */
export async function sendSiteMessage(
  siteId: string,
  message: string,
): Promise<SiteActionState> {
  const trimmed = message.trim()
  if (trimmed.length === 0) {
    return { formError: "Escribe un mensaje." }
  }
  return sendFollowUp(siteId, trimmed)
}

export async function requestSiteChanges(
  siteId: string,
  changes: string,
): Promise<SiteActionState> {
  const trimmed = changes.trim()
  if (trimmed.length < 10) {
    return { formError: "Describe los cambios (mínimo 10 caracteres)." }
  }
  return sendFollowUp(
    siteId,
    `Itera el site ${siteId} con estos cambios pedidos por el humano: ${trimmed}. Genera nueva versión del spec y nuevo preview.`,
  )
}

/**
 * Genera una versión NUEVA desde cero (A/B): re-corre el pipeline COMPLETO
 * (art-director compone un spec + site-builder lo materializa en modo BUILD
 * desde el template) en una rama v{N+1) nueva, SIN tocar las versiones
 * existentes. A diferencia de `requestSiteChanges` (modo edit: parte del código
 * real y exige describir cambios), esto arranca limpio — sirve para comparar
 * direcciones de diseño o modelos del site-builder sobre el mismo brief.
 *
 * Fija `generating` de inmediato para feedback en la UI; si el agente no
 * arranca, revierte al estado anterior (el pipeline lo maneja el agente:
 * save_site_version auto-incrementa version_n y bumpea current_version).
 */
export async function regenerateSite(
  siteId: string,
): Promise<SiteActionState> {
  const supabase = getAdminClient()
  const { data: site, error } = await supabase
    .from("sites")
    .select("id, status")
    .eq("id", siteId)
    .maybeSingle()
  if (error || !site) return { formError: "Sitio no encontrado." }
  if (site.status === "brief" || site.status === "generating") {
    return { formError: "Ya hay una generación en curso." }
  }

  const previousStatus = site.status
  await supabase
    .from("sites")
    .update({ status: "generating" })
    .eq("id", siteId)

  const result = await sendFollowUp(
    siteId,
    `Genera una versión NUEVA del site ${siteId} DESDE CERO — es un A/B para comparar, NO una edición del código actual. Re-corre el pipeline COMPLETO: delega a art-director para componer el spec y luego a site-builder en modo BUILD para materializarlo desde el template en una rama v nueva (save_site_version auto-incrementa la versión). NO partas del código de la versión actual ni la modifiques; deja su preview intacto. Al terminar deja el preview de la versión nueva junto a las existentes (no publiques).`,
  )

  if (result.formError) {
    // El agente no arrancó: revierte para no dejar el sitio colgado en generating.
    await supabase
      .from("sites")
      .update({ status: previousStatus })
      .eq("id", siteId)
    return result
  }

  revalidatePath(`/dashboard/sites/${siteId}`)
  return {}
}
