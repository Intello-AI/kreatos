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
  /** Solo leads con ficha de marca (inner join en lead_brand). */
  hasBrand?: boolean
  /** Solo leads con sitio generado (inner join en sites). */
  hasSite?: boolean
  /** website_quality exacto. */
  quality?: string
  /** manual_rating exacto. */
  rating?: string
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
  hasBrand,
  hasSite,
  quality,
  rating,
}: GetLeadsParams = {}): Promise<GetLeadsResult> {
  const supabase = getAdminClient()

  // Los embeds usan !inner cuando se filtra por presencia (solo leads CON
  // marca / CON sitio); si no, se dejan como join normal para mostrar todos.
  const sitesEmbed = hasSite
    ? "sites!inner(id, status, status_updated_at)"
    : "sites(id, status, status_updated_at)"
  const brandEmbed = hasBrand
    ? "lead_brand!inner(short_name, logo_path, colors, updated_at)"
    : "lead_brand(short_name, logo_path, colors, updated_at)"

  let query = supabase
    .from("leads")
    .select(
      // sites: 1:1 por lead — decide "Generar sitio" vs "Ver sitio" y pinta
      // su status. lead_brand: la ficha de marca (columna Marca).
      `id, place_id, name, category, business_type, google_types, description, address, phone, email, rating, reviews_count, maps_uri, city, status, status_updated_at, notes, site_instructions, language, fetched_at, created_at, website, website_quality, manual_rating, ${sitesEmbed}, ${brandEmbed}`,
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
  if (quality) query = query.eq("website_quality", quality)
  if (rating) query = query.eq("manual_rating", rating)

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

  // PostgREST devuelve la relación embebida como array aunque sea 1:1
  // (unique en lead_id); se normaliza a objeto|null.
  const leads = (data ?? []).map((row) => ({
    ...row,
    sites: Array.isArray(row.sites) ? (row.sites[0] ?? null) : row.sites,
    lead_brand: Array.isArray(row.lead_brand)
      ? (row.lead_brand[0] ?? null)
      : row.lead_brand,
  })) as unknown as Lead[]
  return { leads, count: count ?? 0, error: null }
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

/** Detalle de un lead (todas las columnas + su site 1:1). Server-only. */
export async function getLeadDetail(id: string): Promise<{
  lead: Lead | null
  error: string | null
}> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select("*, sites(id)")
    .eq("id", id)
    .maybeSingle()

  if (error) return { lead: null, error: error.message }
  if (!data) return { lead: null, error: null }
  const lead = {
    ...data,
    sites: Array.isArray(data.sites) ? (data.sites[0] ?? null) : data.sites,
  } as unknown as Lead
  return { lead, error: null }
}
