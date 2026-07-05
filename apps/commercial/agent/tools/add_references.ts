import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../lib/supabase"

function slugFromUrl(url: string): string {
  const host = new URL(url).host.replace(/^www\./, "")
  const path = new URL(url).pathname.replace(/\/$/, "")
  return `${host}${path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** Alta de referencias de diseño desde el chat (después delega el análisis). */
export default defineTool({
  description:
    "Agrega URLs a la biblioteca de referencias de diseño (status pending). Tras agregarlas, delega a design-scout 'analiza las referencias pendientes' para que las procese. Úsalo SOLO cuando el humano pase sitios que le GUSTAN como inspiración a emular. NO lo uses con el sitio ACTUAL de un lead en un rediseño: ese es el target a reemplazar (va al flujo de generación, no a la biblioteca transversal), y meterlo contamina las demás generaciones.",
  inputSchema: z.object({
    urls: z.array(z.string().url()).min(1).max(15),
  }),
  async execute({ urls }) {
    const supabase = getSupabaseClient()
    const rows = urls.map((url) => ({
      slug: slugFromUrl(url),
      url,
      source: "chat",
      status: "pending",
    }))
    const { data, error } = await supabase
      .from("design_references")
      .upsert(rows, { onConflict: "slug", ignoreDuplicates: true })
      .select("slug")
    if (error) throw new Error(`Alta de referencias falló: ${error.message}`)
    return {
      added: (data ?? []).map((r) => r.slug),
      skippedExisting: urls.length - (data?.length ?? 0),
      hint: "Ahora delega a design-scout: 'analiza las referencias pendientes'.",
    }
  },
})
