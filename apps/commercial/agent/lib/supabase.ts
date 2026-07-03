import type { Database, TablesInsert } from "@repo/supabase"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/** Fila de la tabla `leads` tal como la escribe el agente (types generados vía `pnpm db:types`). */
export type LeadRow = TablesInsert<"leads">

/**
 * Cliente Supabase con service role. Solo corre en el runtime del agente
 * (server-side); la key nunca llega a un cliente.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno. Agrégalas a apps/commercial/.env.local (ver .env.example).",
    )
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
