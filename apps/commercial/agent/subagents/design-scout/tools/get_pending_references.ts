import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

export default defineTool({
  description:
    "Lista las referencias de diseño pendientes de análisis (status='pending'), o una específica por URL si se pasa el filtro.",
  inputSchema: z.object({
    url: z
      .string()
      .optional()
      .describe("Filtra por URL exacta (para analizar una puntual)."),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async execute({ url, limit }) {
    const supabase = getSupabaseClient()
    let query = supabase
      .from("design_references")
      .select("id, slug, url, source, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit)
    if (url) query = query.eq("url", url)
    const { data, error } = await query
    if (error) throw new Error(`Lectura de referencias falló: ${error.message}`)

    // Claim: quedan 'analyzing' para que el dashboard muestre en vivo qué se
    // está trabajando (y otra corrida no las tome doble).
    const ids = (data ?? []).map((r) => r.id)
    if (ids.length > 0) {
      await supabase
        .from("design_references")
        .update({ status: "analyzing" })
        .in("id", ids)
    }

    return { references: data ?? [], count: data?.length ?? 0 }
  },
})
