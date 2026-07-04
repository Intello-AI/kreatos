import { getAdminClient } from "@/lib/supabase/admin"
import type { Site, SiteVersion } from "@/features/sites/types"

export interface SiteWithLead extends Site {
  leads: { name: string | null; city: string; place_id: string } | null
}

/** Lista de sitios con su lead, más recientes primero. Server-only. */
export async function getSites(): Promise<{
  sites: SiteWithLead[]
  error: string | null
}> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("sites")
    .select("*, leads(name, city, place_id)")
    .order("created_at", { ascending: false })

  if (error) return { sites: [], error: error.message }
  return { sites: (data ?? []) as SiteWithLead[], error: null }
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
