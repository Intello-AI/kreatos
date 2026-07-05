import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

export default defineTool({
  description:
    "Alimenta el LEAD con datos verificados encontrados al escrapear (email, teléfono, website, notas; en leads manuales creados desde URL también nombre real, categoría y dirección). Solo llena huecos o corrige con evidencia — di en notes de dónde salió cada dato.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().min(8).optional(),
    website: z.string().url().optional(),
    name: z
      .string()
      .min(2)
      .optional()
      .describe(
        "Nombre REAL del negocio (og:site_name/title/©footer). Solo aplica en leads manuales o sin nombre.",
      ),
    category: z
      .string()
      .optional()
      .describe("Giro del negocio deducido del sitio (solo llena hueco)."),
    address: z.string().optional().describe("Dirección encontrada (solo llena hueco)."),
    /** Se AGREGA a las notas existentes del lead, con fuente. */
    appendNotes: z.string().optional(),
  }),
  async execute({ leadId, email, phone, website, name, category, address, appendNotes }) {
    const supabase = getSupabaseClient()
    const { data: lead, error: readError } = await supabase
      .from("leads")
      .select("id, place_id, name, category, address, email, phone, website, notes")
      .eq("id", leadId)
      .maybeSingle()
    if (readError || !lead) throw new Error(`Lead ${leadId} no encontrado.`)

    // Lead manual (creado desde URL por el humano): nombre/categoría nacen
    // sintéticos y el curator los corrige con lo que descubra en el sitio.
    const isManual = lead.place_id?.startsWith("manual-")
    const patch: {
      email?: string
      phone?: string
      website?: string
      name?: string
      category?: string
      address?: string
      notes?: string
    } = {}
    if (email && !lead.email) patch.email = email
    if (phone && !lead.phone) patch.phone = phone
    if (website && !lead.website) patch.website = website
    if (name && (isManual || !lead.name)) patch.name = name
    if (category && !lead.category) patch.category = category
    if (address && !lead.address) patch.address = address
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
