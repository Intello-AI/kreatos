import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Refresca la sesión de Supabase en cada request (corre en proxy.ts) y
 * redirige a "/" (login) cuando no hay usuario. getClaims() verifica el JWT
 * localmente (WebCrypto) — no hace round-trip al Auth server en cada request.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANTE: nada de lógica entre crear el cliente y getClaims() —
  // el refresh de tokens depende de esta llamada.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  const { pathname } = request.nextUrl
  // El login vive en "/" — la raíz es ruta de auth.
  const isAuthRoute =
    pathname === "/" ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/confirm")

  if (!claims && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  // Con sesión activa, "/" no debe mostrar el login.
  if (claims && pathname === "/") {
    const url = request.nextUrl.clone()
    url.pathname = "/leads"
    return NextResponse.redirect(url)
  }

  // Devolver supabaseResponse tal cual: lleva las cookies de sesión frescas.
  return supabaseResponse
}
