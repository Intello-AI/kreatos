import { formatInTimeZone } from "date-fns-tz"

import { LEAD_STATUSES, type LeadStatus } from "@/features/leads/types"
import type { SiteStatus } from "@/features/sites/types"
import { USER_TIME_ZONE } from "@/lib/dates"
import { getAdminClient } from "@/lib/supabase/admin"

export interface DashboardStats {
  leads: {
    total: number
    newThisWeek: number
    byStatus: Record<LeadStatus, number>
    topCategories: Array<{ name: string; count: number }>
  }
  sites: {
    total: number
    inProgress: number
    preview: number
    published: number
  }
  won: number
  /** Serie diaria de los últimos 30 días (zona horaria de la operación). */
  series: Array<{ date: string; leads: number; sites: number }>
  recentSites: Array<{
    id: string
    slug: string
    status: SiteStatus
    created_at: string
    leadName: string | null
  }>
  error: string | null
}

const DAYS = 30

function dayKey(iso: string): string {
  return formatInTimeZone(new Date(iso), USER_TIME_ZONE, "yyyy-MM-dd")
}

/** Métricas del negocio para la home del dashboard. Server-only. */
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = getAdminClient()
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [leadsRes, sitesRes, recentRes] = await Promise.all([
    supabase.from("leads").select("status, category, created_at"),
    supabase.from("sites").select("status, created_at"),
    supabase
      .from("sites")
      .select("id, slug, status, created_at, leads(name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const error =
    leadsRes.error?.message ??
    sitesRes.error?.message ??
    recentRes.error?.message ??
    null

  const leadRows = leadsRes.data ?? []
  const siteRows = sitesRes.data ?? []

  const byStatus = Object.fromEntries(
    LEAD_STATUSES.map((s) => [s, 0])
  ) as Record<LeadStatus, number>
  const categories = new Map<string, number>()
  let newThisWeek = 0
  for (const lead of leadRows) {
    if (lead.status in byStatus) byStatus[lead.status as LeadStatus] += 1
    if (lead.category) {
      categories.set(lead.category, (categories.get(lead.category) ?? 0) + 1)
    }
    if (lead.created_at >= weekAgo) newThisWeek += 1
  }

  // Serie diaria: todos los días presentes aunque valgan 0.
  const series: DashboardStats["series"] = []
  const buckets = new Map<string, { leads: number; sites: number }>()
  for (let i = DAYS - 1; i >= 0; i--) {
    const key = formatInTimeZone(
      new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      USER_TIME_ZONE,
      "yyyy-MM-dd"
    )
    const bucket = { leads: 0, sites: 0 }
    buckets.set(key, bucket)
    series.push({ date: key, ...bucket })
  }
  for (const lead of leadRows) {
    if (lead.created_at < since) continue
    const bucket = buckets.get(dayKey(lead.created_at))
    if (bucket) bucket.leads += 1
  }
  for (const site of siteRows) {
    if (site.created_at < since) continue
    const bucket = buckets.get(dayKey(site.created_at))
    if (bucket) bucket.sites += 1
  }
  for (const point of series) {
    const bucket = buckets.get(point.date)
    if (bucket) {
      point.leads = bucket.leads
      point.sites = bucket.sites
    }
  }

  const siteCount = (statuses: string[]) =>
    siteRows.filter((s) => statuses.includes(s.status)).length

  return {
    leads: {
      total: leadRows.length,
      newThisWeek,
      byStatus,
      topCategories: [...categories.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
    },
    sites: {
      total: siteRows.length,
      inProgress: siteCount(["brief", "generating"]),
      preview: siteCount(["preview", "approved"]),
      published: siteCount(["published"]),
    },
    won: byStatus.won,
    series,
    recentSites: (recentRes.data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      status: row.status as SiteStatus,
      created_at: row.created_at,
      leadName: Array.isArray(row.leads)
        ? ((row.leads[0] as { name: string | null } | undefined)?.name ?? null)
        : ((row.leads as { name: string | null } | null)?.name ?? null),
    })),
    error,
  }
}
