import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

/** Lease del claim: una 'analyzing' más vieja que esto se considera de un run muerto. */
const CLAIM_LEASE_MS = 10 * 60_000

export default defineTool({
  description:
    "Lista las referencias de diseño por analizar (status pending, más las atoradas en analyzing por runs MUERTOS — solo las de lease vencido, no las que otra corrida trabaja ahora mismo), o una específica por URL si se pasa el filtro.",
  inputSchema: z.object({
    url: z
      .string()
      .optional()
      .describe("Filtra por URL exacta (para analizar una puntual)."),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async execute({ url, limit }) {
    const supabase = getSupabaseClient()
    // Elegibles: pending (claimed_at null), o analyzing con lease VENCIDO (run
    // que murió sin terminar). Una analyzing recién reclamada por OTRA corrida
    // (claimed_at reciente) NO se toma — evita el doble análisis / la carrera.
    const staleBefore = new Date(Date.now() - CLAIM_LEASE_MS).toISOString()
    let query = supabase
      .from("design_references")
      .select("id, slug, url, source, status, created_at")
      .in("status", ["pending", "analyzing"])
      .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
      .order("created_at", { ascending: true })
      .limit(limit)
    if (url) query = query.eq("url", url)
    const { data, error } = await query
    if (error) throw new Error(`Lectura de referencias falló: ${error.message}`)

    // Claim con timestamp fresco: quedan 'analyzing' con claimed_at=now para
    // que el dashboard muestre en vivo qué se trabaja y el lease proteja de
    // que otra corrida las tome mientras esta las procesa.
    const ids = (data ?? []).map((r) => r.id)
    if (ids.length > 0) {
      await supabase
        .from("design_references")
        .update({ status: "analyzing", claimed_at: new Date().toISOString() })
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
