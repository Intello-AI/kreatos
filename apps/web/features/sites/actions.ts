"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getAdminClient } from "@/lib/supabase/admin"
import { getEveClient } from "@/lib/eve"
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
    .select("id, eve_session_id, eve_run_ids")
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
    `El humano aprobó y pidió publicar el site ${siteId}. Delega a site-manager: publicar la versión v${site.current_version ?? 1} a producción.`,
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
