import type { AuthFn } from "eve/channels/auth"

/**
 * Autentica requests del browser (dashboard) contra la sesión de Supabase:
 * lee la cookie sb-<ref>-auth-token (soporta chunks .0/.1 y prefijo base64-),
 * extrae el access_token y lo valida contra /auth/v1/user. Solo acepta
 * cuentas @intelloai.com (el mismo dominio que restringe el signup).
 */
export function supabaseSession(): AuthFn<Request> {
  return async (request) => {
    const url = process.env.SUPABASE_URL
    const apiKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !apiKey) return null

    const accessToken = extractAccessToken(request.headers.get("cookie"))
    if (!accessToken) return null

    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: apiKey },
    })
    if (!res.ok) return null

    const user = (await res.json()) as { id?: string; email?: string }
    if (!user.id) return null
    if (!user.email?.toLowerCase().endsWith("@intelloai.com")) return null

    return {
      principalId: user.id,
      principalType: "user",
      authenticator: "supabase",
      attributes: { email: user.email },
    }
  }
}

/** Reconstruye la cookie de sesión de Supabase (posiblemente en chunks) y saca el access_token. */
function extractAccessToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null

  const cookies = new Map<string, string>()
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
  }

  // Base: sb-<ref>-auth-token; con sesiones grandes viene como .0, .1, ...
  let base: string | null = null
  for (const name of cookies.keys()) {
    const match = name.match(/^(sb-.+-auth-token)(?:\.\d+)?$/)
    if (match) {
      base = match[1]
      break
    }
  }
  if (!base) return null

  let raw = cookies.get(base) ?? ""
  if (!raw) {
    for (let i = 0; cookies.has(`${base}.${i}`); i++) {
      raw += cookies.get(`${base}.${i}`)
    }
  }
  if (!raw) return null

  try {
    let json = decodeURIComponent(raw)
    if (json.startsWith("base64-")) {
      json = Buffer.from(json.slice(7), "base64").toString("utf8")
    }
    const session = JSON.parse(json) as { access_token?: string }
    return session.access_token ?? null
  } catch {
    return null
  }
}
