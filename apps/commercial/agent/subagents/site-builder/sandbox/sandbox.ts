import { defineSandbox, defaultBackend } from "eve/sandbox"

/**
 * Sandbox real para construir sitios: git clone, pnpm install, next build.
 * defaultBackend() resuelve Vercel Sandbox en prod (process.env.VERCEL) y
 * Docker en local — sin condicionales propios.
 *
 * Trust boundary: los tokens (GitHub/Vercel/Supabase) viven en las tools
 * (app runtime). El sandbox solo necesita red hacia github.com y el registry
 * de npm. En dev (docker, sin credential brokering) el token de GitHub viaja
 * embebido en la URL del clone (ver clone_site_repo) — excepción aceptada
 * solo en local.
 */
export default defineSandbox({
  backend: defaultBackend(),
  revalidationKey: () => "site-builder-v1",
  async bootstrap({ use }) {
    const sandbox = await use()
    // La imagen base puede no traer pnpm; corepack lo habilita sin red extra.
    await sandbox.run({
      command:
        "command -v pnpm >/dev/null 2>&1 || (corepack enable && corepack prepare pnpm@latest --activate) || npm install -g pnpm",
    })
  },
})
