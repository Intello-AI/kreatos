import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

export default defineTool({
  description:
    "Alimenta el LEAD con datos verificados encontrados al escrapear (email, teléfono, website, notas). Solo llena huecos o corrige con evidencia — di en notes de dónde salió cada dato.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().min(8).optional(),
    website: z.string().url().optional(),
    /** Se AGREGA a las notas existentes del lead, con fuente. */
    appendNotes: z.string().optional(),
  }),
  async execute({ leadId, email, phone, website, appendNotes }) {
    const supabase = getSupabaseClient()
    const { data: lead, error: readError } = await supabase
      .from("leads")
      .select("id, email, phone, website, notes")
      .eq("id", leadId)
      .maybeSingle()
    if (readError || !lead) throw new Error(`Lead ${leadId} no encontrado.`)

    const patch: {
      email?: string
      phone?: string
      website?: string
      notes?: string
    } = {}
    if (email) patch.email = email
    if (phone && !lead.phone) patch.phone = phone
    if (website && !lead.website) patch.website = website
    if (appendNotes) {
      patch.notes = [lead.notes, appendNotes].filter(Boolean).join("\n")
    }
    if (Object.keys(patch).length === 0) {
      return { ok: true, updated: [], note: "Nada nuevo que guardar." }
    }

    const { error } = await supabase.from("leads").update(patch).eq("id", leadId)
    if (error) throw new Error(`Update del lead falló: ${error.message}`)
    return { ok: true, updated: Object.keys(patch) }
  },
})
