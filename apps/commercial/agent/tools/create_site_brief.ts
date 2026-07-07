import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../lib/supabase"

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** Arranque del flujo de sitio desde el chat: crea el site row (brief). */
export default defineTool({
  description:
    "Crea el brief del sitio para un lead (fila en `sites`, status brief) cuando el humano pide 'génerale el sitio a X' por chat. Devuelve el siteId — INMEDIATAMENTE después delega a ART-DIRECTOR con [Contexto: site <siteId>] para que componga el SPEC (concepto, paleta, tipografía, páginas); con su reporte encadenas a site-builder SIN preguntar. NUNCA saltes directo a site-builder en una generación nueva: sin spec del director el sitio sale genérico. Si el lead ya tiene sitio, lo devuelve sin duplicar.",
  inputSchema: z.object({
    query: z.string().min(2).describe("Nombre (parcial) del negocio."),
    referenceSlug: z
      .string()
      .optional()
      .describe("Referencia guía elegida por el humano (si la nombró)."),
    instructions: z
      .string()
      .optional()
      .describe("Instrucciones del humano para el sitio, tal cual."),
    contactForm: z.boolean().default(false),
  }),
  async execute({ query, referenceSlug, instructions, contactForm }) {
    const supabase = getSupabaseClient()
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, place_id, city, website, sites(id, slug, status)")
      .ilike("name", `%${query}%`)
      .limit(1)
      .maybeSingle()
    if (!lead) throw new Error(`No encontré un lead que matchee "${query}".`)

    const existing = Array.isArray(lead.sites)
      ? (lead.sites[0] ?? null)
      : lead.sites
    if (existing) {
      return {
        siteId: existing.id,
        slug: existing.slug,
        status: existing.status,
        alreadyExisted: true,
        hint: "El lead ya tiene sitio: no crees otro. Iteración puntual sobre el preview → delega a site-builder con este siteId. Rediseño mayor (concepto/paleta/estructura nuevos) → delega primero a art-director, luego site-builder.",
      }
    }

    const slug = slugify(`${lead.name ?? lead.place_id}-${lead.city.split(",")[0]}`)
    const brief = {
      ...(referenceSlug ? { referenceSlug } : {}),
      ...(instructions ? { instructions } : {}),
      contactForm,
    }
    const { data: site, error } = await supabase
      .from("sites")
      .insert({ lead_id: lead.id, slug, brief, status: "brief" })
      .select("id, slug")
      .single()
    if (error) throw new Error(`No se pudo crear el sitio: ${error.message}`)

    await supabase.from("lead_activity").insert({
      lead_id: lead.id,
      type: "site_brief_created",
      note: `Brief creado para ${slug}${referenceSlug ? ` (referencia guía: ${referenceSlug})` : ""} — vía chat.`,
      actor: "humano",
    })

    // Guard de ficha de marca: un sitio sin ficha sale genérico. Si el lead
    // tiene MATERIAL (website o archivos en el inbox) pero CERO ficha guardada,
    // es la firma del fallo silencioso del curador (analizó y reportó en prosa,
    // pero no llamó save_brand_profile → dashboard "Sin ficha de marca"). Se
    // avisa fuerte para que el root cure ANTES de componer el spec.
    let brandWarning = ""
    const { data: brand } = await supabase
      .from("lead_brand")
      .select("lead_id")
      .eq("lead_id", lead.id)
      .maybeSingle()
    if (!brand) {
      const { data: inbox } = await supabase.storage
        .from("brand-assets")
        .list(`${lead.id}/inbox`)
      const inboxCount = inbox?.length ?? 0
      if (inboxCount > 0 || lead.website) {
        const material = [
          inboxCount > 0 ? `${inboxCount} archivo(s) en el inbox` : "",
          lead.website ? `sitio ${lead.website}` : "",
        ]
          .filter(Boolean)
          .join(" + ")
        brandWarning =
          `⚠️ El lead NO tiene ficha de marca guardada pese a tener material (${material}). ` +
          `Sin ficha el sitio sale GENÉRICO (paleta/logo/servicios inventados). CURA la marca ANTES de ` +
          `componer: delega a brand-curator con [Contexto: lead ${lead.id}] y EXÍGELE guardar con ` +
          `save_brand_profile (un reporte en prosa sin ficha guardada es un fallo). Después compón el spec. `
      }
    }

    return {
      siteId: site.id,
      slug: site.slug,
      alreadyExisted: false,
      brandMissing: Boolean(brandWarning),
      hint: `${brandWarning}Ahora delega a ART-DIRECTOR (NO a site-builder): "Compón el SPEC de diseño del site ${site.id} (lead \"${lead.name}\")${referenceSlug ? ` — referencia guía: ${referenceSlug}` : ""}${instructions ? ` — instrucciones del humano: ${instructions}` : ""}". Con su reporte (site_id + notes), encadena a site-builder de inmediato y sin preguntar.`,
    }
  },
})
