import { getAdminClient } from "@/lib/supabase/admin"
import {
  LEAD_STATUSES,
  type Lead,
  type LeadStatus,
} from "@/features/leads/types"

export const LEADS_PAGE_SIZE = 15

export interface GetLeadsParams {
  page?: number
  q?: string
  status?: LeadStatus
  city?: string
}

export interface GetLeadsResult {
  leads: Lead[]
  /** Total de filas que cumplen los filtros (para paginación). */
  count: number
  error: string | null
}

/** Lee leads paginados y filtrados, más recientes primero. Server-only. */
export async function getLeads({
  page = 1,
  q,
  status,
  city,
}: GetLeadsParams = {}): Promise<GetLeadsResult> {
  const supabase = getAdminClient()

  let query = supabase
    .from("leads")
    .select(
      "id, place_id, name, category, business_type, google_types, description, address, phone, email, rating, reviews_count, maps_uri, city, status, status_updated_at, notes, site_instructions, fetched_at, created_at",
      { count: "exact" }
    )

  if (q) {
    // PostgREST usa , ( ) como sintaxis dentro de .or(); se neutralizan.
    const term = q.replace(/[,()]/g, " ").trim()
    if (term) {
      query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%`)
    }
  }
  if (status) query = query.eq("status", status)
  if (city) query = query.eq("city", city)

  const from = (Math.max(1, page) - 1) * LEADS_PAGE_SIZE
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + LEADS_PAGE_SIZE - 1)

  if (error) {
    // PGRST103: página fuera de rango; se trata como resultado vacío.
    if (error.code === "PGRST103") {
      return { leads: [], count: count ?? 0, error: null }
    }
    return { leads: [], count: 0, error: error.message }
  }

  return { leads: (data ?? []) as Lead[], count: count ?? 0, error: null }
}

/** Ciudades distintas presentes en leads, para el filtro. Server-only. */
export async function getLeadCities(): Promise<string[]> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select("city")
    .order("city", { ascending: true })

  if (error) return []
  return [...new Set((data ?? []).map((row) => row.city).filter(Boolean))]
}

export function parseLeadStatus(
  value: string | undefined
): LeadStatus | undefined {
  return LEAD_STATUSES.includes(value as LeadStatus)
    ? (value as LeadStatus)
    : undefined
}
