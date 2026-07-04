import { getVercelOidcToken } from "@vercel/oidc"
import { Client } from "eve/client"

/**
 * Cliente del canal eve montado en esta misma app (withEve). En Vercel usa el
 * dominio de producción del proyecto (VERCEL_URL está protegida por Vercel
 * Auth) y se autentica con OIDC; en local, el dev server sin auth.
 */
export function getEveClient(): Client {
  const host =
    process.env.EVE_HOST ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://127.0.0.1:3000")
  return new Client({
    host,
    auth: process.env.VERCEL
      ? { vercelOidc: { token: async () => await getVercelOidcToken() } }
      : undefined,
  })
}
