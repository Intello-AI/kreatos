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
  // v4: invalida snapshots que se cachearon SIN chromium (el bootstrap
  // silenciaba el error y `pnpm qa` lo instalaba en runtime → 5+ min →
  // "terminated" a media corrida).
  revalidationKey: () => "site-builder-v4",
  async bootstrap({ use }) {
    const sandbox = await use()
    // La imagen base puede no traer pnpm; corepack lo habilita sin red extra.
    await sandbox.run({
      command:
        "command -v pnpm >/dev/null 2>&1 || (corepack enable && corepack prepare pnpm@latest --activate) || npm install -g pnpm",
    })
    // ffmpeg para optimizar imágenes (webp, resize). Best-effort en orden:
    // gestor de paquetes de la imagen (apt/dnf) y, si no hay, build estático.
    await sandbox.run({
      command: [
        "command -v ffmpeg >/dev/null 2>&1",
        "(apt-get update -qq && apt-get install -yqq ffmpeg) >/dev/null 2>&1",
        "(dnf install -yq ffmpeg 2>/dev/null || sudo dnf install -yq ffmpeg 2>/dev/null)",
        "(curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/ffmpeg.tar.xz && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp && (install -m 755 /tmp/ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ffmpeg 2>/dev/null || sudo install -m 755 /tmp/ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ffmpeg))",
        "echo 'ffmpeg no disponible (continuar sin optimizacion)'",
      ].join(" || "),
    })
    // Chromium para el paso screenshots de `pnpm qa` (Playwright). Se
    // precalienta en el snapshot: instala el browser + deps del sistema al
    // cache global (~/.cache/ms-playwright), que el playwright del repo
    // clonado reutiliza. SIN silenciar: un snapshot cacheado sin chromium
    // obliga a instalarlo en runtime dentro de `pnpm qa` (5+ min →
    // terminated). Fallback sin --with-deps si apt falla.
    await sandbox.run({
      command:
        "cd /tmp && (pnpm dlx playwright@1.55.0 install chromium --with-deps || pnpm dlx playwright@1.55.0 install chromium)",
    })
    // Verificación: si no quedó, que el snapshot lo diga a gritos en el log.
    await sandbox.run({
      command:
        "ls ~/.cache/ms-playwright 2>/dev/null | grep -q chromium && echo 'chromium precalentado OK' || echo 'AVISO: chromium NO se precalento — pnpm qa lo instalara en runtime (lento)'",
    })
  },
})
