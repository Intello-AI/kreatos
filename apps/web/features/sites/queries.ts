import { getAdminClient } from "@/lib/supabase/admin"
import type { Site, SiteVersion } from "@/features/sites/types"

export interface SiteWithLead extends Site {
  leads: { name: string | null; city: string; place_id: string } | null
}

export interface SiteListRow extends SiteWithLead {
  /** Última versión embebida (limit 1 desc) — para el link de preview. */
  site_versions: { preview_url: string | null; version_n: number }[]
  /** Última actividad real del agente (max token_usage.created_at). El badge
   *  la usa para no marcar "Detenido" una generación viva pero larga. */
  lastActivityAt?: string | null
}

/** Lista de sitios con su lead y última versión, más recientes primero. */
export async function getSites(): Promise<{
  sites: SiteListRow[]
  error: string | null
}> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("sites")
    .select(
      "*, leads(name, city, place_id), site_versions(preview_url, version_n)"
    )
    .order("created_at", { ascending: false })
    .order("version_n", {
      referencedTable: "site_versions",
      ascending: false,
    })
    .limit(1, { referencedTable: "site_versions" })

  if (error) return { sites: [], error: error.message }

  const sites = (data ?? []) as SiteListRow[]

  // Último latido real solo de las generaciones en curso (el badge lo usa para
  // no marcar "Detenido" un build vivo pero largo). Una query barata: una fila
  // por sitio en site_activity_ping.
  const generatingIds = sites
    .filter((s) => s.status === "generating")
    .map((s) => s.id)
  if (generatingIds.length > 0) {
    const { data: pings } = await supabase
      .from("site_activity_ping")
      .select("site_id, last_activity_at")
      .in("site_id", generatingIds)
    const pingBySite = new Map(
      (pings ?? []).map((p) => [p.site_id, p.last_activity_at]),
    )
    for (const site of sites) {
      if (pingBySite.has(site.id)) {
        site.lastActivityAt = pingBySite.get(site.id) ?? null
      }
    }
  }

  return { sites, error: null }
}

/** Un sitio con lead y todas sus versiones. Server-only. */
export async function getSiteDetail(siteId: string): Promise<{
  site: SiteWithLead | null
  versions: SiteVersion[]
  error: string | null
}> {
  const supabase = getAdminClient()
  const [siteRes, versionsRes] = await Promise.all([
    supabase
      .from("sites")
      .select("*, leads(name, city, place_id)")
      .eq("id", siteId)
      .maybeSingle(),
    supabase
      .from("site_versions")
      .select("*")
      .eq("site_id", siteId)
      .order("version_n", { ascending: false }),
  ])

  if (siteRes.error)
    return { site: null, versions: [], error: siteRes.error.message }
  if (versionsRes.error)
    return { site: null, versions: [], error: versionsRes.error.message }

  return {
    site: (siteRes.data as SiteWithLead | null) ?? null,
    versions: versionsRes.data ?? [],
    error: null,
  }
}
