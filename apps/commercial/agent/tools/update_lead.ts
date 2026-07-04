import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../lib/supabase"

const STATUSES = ["new", "proposal_ready", "contacted", "won", "lost"] as const

/** Acciones ligeras del humano sobre un lead, dictadas por chat. */
export default defineTool({
  description:
    "Actualiza un lead por dictado del humano: cambia su status (contacted/won/lost — 'lo contacté', 'ya me compró', 'no le interesó') y/o agrega una nota al timeline. Acción directa del humano — ejecútala sin delegar. NUNCA la uses por iniciativa propia.",
  inputSchema: z.object({
    query: z.string().min(2).describe("Nombre (parcial) del negocio."),
    status: z.enum(STATUSES).optional(),
    appendNote: z
      .string()
      .min(3)
      .optional()
      .describe("Nota del humano para el timeline (tal cual la dictó)."),
  }),
  async execute({ query, status, appendNote }) {
    if (!status && !appendNote) {
      throw new Error("Nada que actualizar: pasa status y/o appendNote.")
    }
    const supabase = getSupabaseClient()
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, status")
      .ilike("name", `%${query}%`)
      .limit(1)
      .maybeSingle()
    if (!lead) throw new Error(`No encontré un lead que matchee "${query}".`)

    if (status && status !== lead.status) {
      const { error } = await supabase
        .from("leads")
        .update({ status })
        .eq("id", lead.id)
      if (error) throw new Error(`Update falló: ${error.message}`)
      await supabase.from("lead_activity").insert({
        lead_id: lead.id,
        type: "status_changed",
        note: `Status: ${lead.status} → ${status} (dictado por el humano)`,
        actor: "humano",
      })
    }
    if (appendNote) {
      await supabase.from("lead_activity").insert({
        lead_id: lead.id,
        type: "note",
        note: appendNote,
        actor: "humano",
      })
    }
    return {
      lead: lead.name,
      status: status ?? lead.status,
      noted: Boolean(appendNote),
    }
  },
})
