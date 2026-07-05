import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

export default defineTool({
  description:
    "Lista las referencias de diseño por analizar (status pending, más las atoradas en analyzing por runs muertos — se re-reclaman), o una específica por URL si se pasa el filtro.",
  inputSchema: z.object({
    url: z
      .string()
      .optional()
      .describe("Filtra por URL exacta (para analizar una puntual)."),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async execute({ url, limit }) {
    const supabase = getSupabaseClient()
    // Incluye también las atoradas en "analyzing": si un run anterior murió
    // tras reclamarlas quedarían huérfanas para siempre — se re-reclaman.
    let query = supabase
      .from("design_references")
      .select("id, slug, url, source, status, created_at")
      .in("status", ["pending", "analyzing"])
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

    // remainingPending: cuántas referencias siguen SIN reclamar (status
    // 'pending') tras este claim. Es el resto de la cola — el subagente lo usa
    // para decidir si drena más (o el root re-delega mientras sea > 0). Antes
    // el outputSchema lo exigía pero ninguna tool lo calculaba: el modelo lo
    // fabricaba. Con `url` (analiza una puntual) no aplica el concepto de cola.
    let remainingPending = 0
    if (!url) {
      const { count } = await supabase
        .from("design_references")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
      remainingPending = count ?? 0
    }

    return {
      references: data ?? [],
      count: data?.length ?? 0,
      remainingPending,
    }
  },
})
