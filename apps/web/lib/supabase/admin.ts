import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Cliente Supabase con service role. SOLO importar desde Server Components o
 * código de servidor: la service role key jamás debe llegar al cliente.
 * (Las env vars sin prefijo NEXT_PUBLIC_ no se inlinean en el bundle cliente.)
 */
export function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno. Agrégalas a apps/web/.env.local (ver .env.example).",
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
