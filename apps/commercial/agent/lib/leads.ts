import { getSupabaseClient } from "./supabase"

/** Subconjunto de `leads` que consumen proposal/outreach. */
export interface LeadSummary {
  id: string
  place_id: string
  name: string | null
  category: string | null
  business_type: string | null
  description: string | null
  address: string | null
  phone: string | null
  rating: number | null
  reviews_count: number | null
  city: string
  status: string
  notes: string | null
}

const LEAD_SUMMARY_COLUMNS =
  "id, place_id, name, category, business_type, description, address, phone, rating, reviews_count, city, status, notes"

export type LeadStatus =
  | "new"
  | "proposal_ready"
  | "contacted"
  | "won"
  | "lost"

/** Lista leads por status, más recientes primero. */
export async function listLeads(
  status: LeadStatus,
  limit = 20,
): Promise<LeadSummary[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SUMMARY_COLUMNS)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Lectura de leads falló: ${error.message}`)
  return (data ?? []) as LeadSummary[]
}

/** Busca un lead por place_id exacto o por nombre (ilike). */
export async function findLead(query: string): Promise<LeadSummary | null> {
  const supabase = getSupabaseClient()
  const byId = await supabase
    .from("leads")
    .select(LEAD_SUMMARY_COLUMNS)
    .eq("place_id", query)
    .maybeSingle()
  if (byId.error) throw new Error(`Búsqueda de lead falló: ${byId.error.message}`)
  if (byId.data) return byId.data as LeadSummary

  const byName = await supabase
    .from("leads")
    .select(LEAD_SUMMARY_COLUMNS)
    .ilike("name", `%${query}%`)
    .limit(1)
    .maybeSingle()
  if (byName.error)
    throw new Error(`Búsqueda de lead falló: ${byName.error.message}`)
  return (byName.data as LeadSummary | null) ?? null
}

/** Actividades de un lead, más recientes primero. */
export async function listActivity(
  leadId: string,
  limit = 10,
): Promise<Array<{ type: string; note: string | null; actor: string | null; created_at: string }>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("lead_activity")
    .select("type, note, actor, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Lectura de lead_activity falló: ${error.message}`)
  return data ?? []
}

/**
 * ¿El lead ya tiene una actividad de este tipo exacto? Query directa por
 * (lead_id, type) — no depende de traer las últimas N filas (un lead con
 * historial largo empujaba el borrador fuera de la ventana y se duplicaba).
 */
export async function hasActivityOfType(
  leadId: string,
  type: string,
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("lead_activity")
    .select("id")
    .eq("lead_id", leadId)
    .eq("type", type)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Lectura de lead_activity falló: ${error.message}`)
  return Boolean(data)
}

/** Registra un hito en lead_activity. */
export async function addActivity(input: {
  leadId: string
  type: string
  note: string
  actor: string
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from("lead_activity").insert({
    lead_id: input.leadId,
    type: input.type,
    note: input.note,
    actor: input.actor,
  })
  if (error) throw new Error(`Insert en lead_activity falló: ${error.message}`)
}

/** Cambia el status de un lead (el trigger mantiene status_updated_at). */
export async function setLeadStatus(
  leadId: string,
  status: LeadStatus,
): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
  if (error) throw new Error(`Update de status falló: ${error.message}`)
}
