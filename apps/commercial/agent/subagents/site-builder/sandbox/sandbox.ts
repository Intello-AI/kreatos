import { defineSandbox, defaultBackend } from "eve/sandbox"

/**
 * Libs de sistema para chromium en Amazon Linux 2023 (el SO real del Vercel
 * Sandbox — sin apt, `--with-deps` nunca instaló nada y el navegador moría
 * con "libnspr4.so: cannot open shared object file"). Verificado 2026-07-04.
 */
const CHROMIUM_DNF_DEPS =
  "nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXfixes libXrandr mesa-libgbm alsa-lib pango cairo"

const CHROMIUM_BOOTSTRAP = `cd /tmp && pnpm dlx playwright@1.61.1 install chromium && ((command -v dnf >/dev/null 2>&1 && (sudo dnf install -yq ${CHROMIUM_DNF_DEPS} || dnf install -yq ${CHROMIUM_DNF_DEPS})) || (command -v apt-get >/dev/null 2>&1 && pnpm dlx playwright@1.61.1 install-deps chromium))`

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
  // v6: deps del sistema vía dnf (el sandbox es Amazon Linux 2023, sin apt)
  // — chromium descargaba pero moría al arrancar (libnspr4.so faltante).
  revalidationKey: () => "site-builder-v6",
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
    // precalienta en el snapshot: browser al cache global
    // (~/.cache/ms-playwright, que el playwright del repo clonado reutiliza
    // — misma minor 1.61 = misma revisión) + libs del sistema vía dnf.
    // No-fatal (un throw aquí tira el DEPLOY completo), pero sin silenciar:
    // el aviso queda en el log del build.
    await sandbox.run({
      command: `(${CHROMIUM_BOOTSTRAP}) || echo 'AVISO: chromium NO se precalento — pnpm qa lo intentara en runtime (lento)'`,
    })
  },
})
