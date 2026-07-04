import { defineSandbox, defaultBackend } from "eve/sandbox"

/**
 * Sandbox del design-scout: solo existe para capturar screenshots de las
 * referencias con Playwright (el teardown de CSS/HTML sigue siendo web_fetch
 * en el runtime). Chromium precalentado en el snapshot.
 */
export default defineSandbox({
  backend: defaultBackend(),
  // v2: invalida el snapshot que quedó cacheado SIN chromium (el bootstrap
  // tragaba el error de instalación y capture_screenshots moría con
  // "Playwright was just installed or updated").
  revalidationKey: () => "design-scout-v2",
  async bootstrap({ use }) {
    const sandbox = await use()
    await sandbox.run({
      command:
        "command -v pnpm >/dev/null 2>&1 || (corepack enable && corepack prepare pnpm@latest --activate) || npm install -g pnpm",
    })
    await sandbox.run({
      command:
        "(cd /tmp && pnpm dlx playwright@1.55.0 install chromium --with-deps) >/dev/null 2>&1 || echo 'chromium no precalentado (capture lo intentara)'",
    })
    // ffmpeg: reducir las capturas full-page antes de mandarlas a visión.
    await sandbox.run({
      command:
        "command -v ffmpeg >/dev/null 2>&1 || (apt-get update -qq && apt-get install -yqq ffmpeg) >/dev/null 2>&1 || echo 'sin ffmpeg (se analiza el png completo)'",
    })
  },
})
