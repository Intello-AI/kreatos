import { defineSandbox, defaultBackend } from "eve/sandbox"

/**
 * Libs de sistema que chromium necesita en Amazon Linux 2023 (el SO real del
 * Vercel Sandbox — sin apt, por eso `--with-deps` nunca instaló nada y el
 * navegador moría con "error while loading shared libraries: libnspr4.so").
 * Verificado empíricamente 2026-07-04: con estas libs + chromium 1.61.1 el
 * screenshot sale.
 */
export const CHROMIUM_DNF_DEPS =
  "nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXfixes libXrandr mesa-libgbm alsa-lib pango cairo"

/** Instala chromium + deps del sistema (dnf en AL2023, apt en docker dev). */
export const CHROMIUM_BOOTSTRAP = `cd /tmp && pnpm dlx playwright@1.61.1 install chromium && ((command -v dnf >/dev/null 2>&1 && (sudo dnf install -yq ${CHROMIUM_DNF_DEPS} || dnf install -yq ${CHROMIUM_DNF_DEPS})) || (command -v apt-get >/dev/null 2>&1 && pnpm dlx playwright@1.61.1 install-deps chromium))`

/**
 * Sandbox del design-scout: solo existe para capturar screenshots de las
 * referencias con Playwright (el teardown de CSS/HTML sigue siendo web_fetch
 * en el runtime). Chromium precalentado en el snapshot.
 */
export default defineSandbox({
  backend: defaultBackend(),
  // v4: deps del sistema vía dnf (Amazon Linux 2023) — con apt/--with-deps
  // chromium descargaba pero moría al arrancar (libnspr4.so faltante).
  revalidationKey: () => "design-scout-v4",
  async bootstrap({ use }) {
    const sandbox = await use()
    await sandbox.run({
      command:
        "command -v pnpm >/dev/null 2>&1 || (corepack enable && corepack prepare pnpm@latest --activate) || npm install -g pnpm",
    })
    // No-fatal (un throw tira el deploy), pero sin silenciar el error.
    await sandbox.run({
      command: `(${CHROMIUM_BOOTSTRAP}) || echo 'AVISO: chromium NO se precalento (capture lo intentara en runtime)'`,
    })
    // ffmpeg: reducir las capturas full-page antes de mandarlas a visión.
    await sandbox.run({
      command:
        "command -v ffmpeg >/dev/null 2>&1 || (apt-get update -qq && apt-get install -yqq ffmpeg) >/dev/null 2>&1 || echo 'sin ffmpeg (se analiza el png completo)'",
    })
  },
})
