import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"
import {
  getDesignPresets,
  getDesignReferences,
  getLatestVersion,
  getSiblingSpecs,
  getSite,
} from "../lib/sites"

export default defineTool({
  description:
    "Punto de partida de toda corrida: devuelve el site (brief del dashboard), el lead completo, el spec de la última versión si existe, los presets de diseño disponibles, referencias curadas del giro y un resumen de sitios previos del mismo giro (para la regla anti-convergencia).",
  inputSchema: z.object({
    siteId: z.string().uuid().describe("id de la fila en `sites`."),
    industry: z
      .string()
      .optional()
      .describe(
        "Giro normalizado para buscar referencias (ej. 'contable', 'construccion', 'logistica', 'distribucion'). Si se omite, no se traen referencias.",
      ),
  }),
  async execute({ siteId, industry }) {
    const site = await getSite(siteId)

    const supabase = getSupabaseClient()
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", site.lead_id)
      .maybeSingle()
    if (error) throw new Error(`Lectura del lead falló: ${error.message}`)
    if (!lead) throw new Error(`El site ${siteId} apunta a un lead inexistente.`)

    const [latestVersion, presets, references, siblings] = await Promise.all([
      getLatestVersion(siteId),
      getDesignPresets(),
      industry
        ? getDesignReferences({ industry, limit: 3 })
        : Promise.resolve([]),
      industry
        ? getSiblingSpecs({ industry, excludeSiteId: siteId })
        : Promise.resolve([]),
    ])

    return {
      site: {
        id: site.id,
        slug: site.slug,
        status: site.status,
        brief: site.brief,
        repoUrl: site.repo_url,
        vercelProjectId: site.vercel_project_id,
        currentVersion: site.current_version,
      },
      lead,
      latestSpec: latestVersion?.spec ?? null,
      latestVersionN: latestVersion?.version_n ?? null,
      presets,
      designReferences: references,
      siblingSites: siblings,
    }
  },
})
