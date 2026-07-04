import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../lib/supabase"

/**
 * Estado del pipeline para el ORQUESTADOR: responde "¿cómo va X?" al
 * instante, sin delegar a un subagente (delegar solo para leer la BDD
 * cuesta una sesión completa).
 */
export default defineTool({
  description:
    "Snapshot del pipeline comercial: conteos de leads por status, sitios por status y últimos sitios con su preview. Con `query` (nombre de negocio) devuelve el detalle puntual de ese lead/sitio (status, versión, preview_url, última actividad). Úsalo para responder preguntas de estado — NO delegues a un subagente solo para consultar cómo va algo.",
  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .optional()
      .describe("Nombre (parcial) del negocio para el detalle puntual."),
  }),
  async execute({ query }) {
    const supabase = getSupabaseClient()

    if (query) {
      const { data: leads } = await supabase
        .from("leads")
        .select(
          "id, name, status, city, phone, website, sites(id, slug, status, current_version, deploy_url)",
        )
        .ilike("name", `%${query}%`)
        .limit(3)
      const detailed = await Promise.all(
        (leads ?? []).map(async (lead) => {
          const site = Array.isArray(lead.sites)
            ? (lead.sites[0] ?? null)
            : lead.sites
          const [activity, version] = await Promise.all([
            supabase
              .from("lead_activity")
              .select("type, note, created_at")
              .eq("lead_id", lead.id)
              .order("created_at", { ascending: false })
              .limit(3),
            site
              ? supabase
                  .from("site_versions")
                  .select("version_n, preview_url, changelog")
                  .eq("site_id", site.id)
                  .order("version_n", { ascending: false })
                  .limit(1)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ])
          return {
            ...lead,
            sites: undefined,
            site: site
              ? { ...site, latestVersion: version.data ?? null }
              : null,
            recentActivity: activity.data ?? [],
          }
        }),
      )
      return { matches: detailed }
    }

    const [leadsRes, sitesRes, recentRes] = await Promise.all([
      supabase.from("leads").select("status"),
      supabase.from("sites").select("status"),
      supabase
        .from("sites")
        .select("slug, status, current_version, created_at, leads(name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ])
    const countBy = (rows: Array<{ status: string }> | null) => {
      const out: Record<string, number> = {}
      for (const row of rows ?? []) out[row.status] = (out[row.status] ?? 0) + 1
      return out
    }
    return {
      leadsByStatus: countBy(leadsRes.data),
      sitesByStatus: countBy(sitesRes.data),
      recentSites: (recentRes.data ?? []).map((s) => ({
        ...s,
        leads: undefined,
        leadName: Array.isArray(s.leads)
          ? ((s.leads[0] as { name: string | null } | undefined)?.name ?? null)
          : ((s.leads as { name: string | null } | null)?.name ?? null),
      })),
    }
  },
})
