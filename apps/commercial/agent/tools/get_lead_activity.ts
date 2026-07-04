import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../lib/supabase"

/** Timeline completo de un lead: propuesta, borradores de outreach, hitos. */
export default defineTool({
  description:
    "Lee el timeline completo de un lead por nombre: la propuesta guardada, los borradores de outreach (WhatsApp/llamada) COMPLETOS y los hitos del sitio. Úsalo cuando el humano pida ver/leer la propuesta o un borrador — no delegues solo para leer.",
  inputSchema: z.object({
    query: z.string().min(2).describe("Nombre (parcial) del negocio."),
    type: z
      .string()
      .optional()
      .describe(
        "Filtra por tipo: proposal, outreach_draft_whatsapp, outreach_draft_phone_script, site_status_change...",
      ),
    limit: z.number().int().min(1).max(30).default(10),
  }),
  async execute({ query, type, limit }) {
    const supabase = getSupabaseClient()
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, status, city")
      .ilike("name", `%${query}%`)
      .limit(1)
      .maybeSingle()
    if (!lead) return { lead: null, activity: [] }

    let q = supabase
      .from("lead_activity")
      .select("type, note, actor, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (type) q = q.eq("type", type)
    const { data: activity, error } = await q
    if (error) throw new Error(`Lectura de actividad falló: ${error.message}`)
    return { lead, activity: activity ?? [] }
  },
})
