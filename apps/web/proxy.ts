import { type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

// Next 16: proxy.ts reemplaza a middleware.ts.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Excluir estáticos y, crítico, las rutas de eve (/eve/v1/*): el agente y
  // el dispatch de schedules no llevan sesión de Supabase.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|eve|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
