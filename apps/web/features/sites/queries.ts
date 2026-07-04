import { getAdminClient } from "@/lib/supabase/admin"
import type { Site, SiteVersion } from "@/features/sites/types"

export interface SiteWithLead extends Site {
  leads: { name: string | null; city: string; place_id: string } | null
}

export interface SiteListRow extends SiteWithLead {
  /** Última versión embebida (limit 1 desc) — para el link de preview. */
  site_versions: { preview_url: string | null; version_n: number }[]
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
  return { sites: (data ?? []) as SiteListRow[], error: null }
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
