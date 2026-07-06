import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../lib/supabase"

/** Aprobación del preview, dictada por el humano en el chat. */
export default defineTool({
  description:
    "Marca el sitio de un lead como 'approved' (el humano revisó el preview y lo aprobó). SOLO cuando el humano lo dice explícitamente ('apruébalo', 'me gusta, apruébalo') — NUNCA por iniciativa propia. Aprobar NO publica: publicar a producción (modo publish de site-builder, con la tool publish_site) requiere un pedido explícito aparte del humano.",
  inputSchema: z.object({
    query: z.string().min(2).describe("Nombre (parcial) del negocio."),
  }),
  async execute({ query }) {
    const supabase = getSupabaseClient()
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, sites(id, slug, status)")
      .ilike("name", `%${query}%`)
      .limit(1)
      .maybeSingle()
    const site = lead
      ? Array.isArray(lead.sites)
        ? (lead.sites[0] ?? null)
        : lead.sites
      : null
    if (!lead || !site) {
      throw new Error(`No encontré un sitio para "${query}".`)
    }
    if (site.status === "approved") {
      return { slug: site.slug, status: "approved", unchanged: true }
    }
    if (site.status !== "preview") {
      throw new Error(
        `Solo se aprueba un sitio en 'preview' (actual: ${site.status}).`,
      )
    }
    const { error } = await supabase
      .from("sites")
      .update({ status: "approved" })
      .eq("id", site.id)
    if (error) throw new Error(`Aprobación falló: ${error.message}`)
    await supabase.from("lead_activity").insert({
      lead_id: lead.id,
      type: "site_status_change",
      note: "preview → approved (aprobado por el humano vía chat)",
      actor: "humano",
    })
    return {
      slug: site.slug,
      status: "approved",
      hint: "Aprobado. Publicar a producción (merge a main) lo hace site-builder en modo publish (tool publish_site, con aprobación humana) y requiere que el humano lo pida explícitamente — no publiques por iniciativa propia.",
    }
  },
})
