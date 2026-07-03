import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/** Fila de la tabla `leads` tal como la escribe el agente. */
export interface LeadRow {
  place_id: string
  name: string | null
  category: string | null
  business_type: string | null
  google_types: string[]
  description: string | null
  address: string | null
  phone: string | null
  website: string | null
  rating: number | null
  reviews_count: number | null
  maps_uri: string | null
  city: string
  fetched_at: string
}

/**
 * Cliente Supabase con service role. Solo corre en el runtime del agente
 * (server-side); la key nunca llega a un cliente.
 */
export function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno. Agrégalas a apps/commercial/.env.local (ver .env.example).",
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
