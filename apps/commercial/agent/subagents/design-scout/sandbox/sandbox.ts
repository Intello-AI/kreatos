import { defineSandbox, defaultBackend } from "eve/sandbox"

/**
 * Sandbox del design-scout: solo existe para capturar screenshots de las
 * referencias con Playwright (el teardown de CSS/HTML sigue siendo web_fetch
 * en el runtime). Chromium precalentado en el snapshot.
 */
export default defineSandbox({
  backend: defaultBackend(),
  // v3: playwright 1.61.1 — 1.55.0 no soporta el ubuntu 26.04 del Vercel
  // Sandbox, así que el bootstrap fallaba SIEMPRE en prod (silenciado) y
  // ninguna referencia tuvo screenshots.
  revalidationKey: () => "design-scout-v3",
  async bootstrap({ use }) {
    const sandbox = await use()
    await sandbox.run({
      command:
        "command -v pnpm >/dev/null 2>&1 || (corepack enable && corepack prepare pnpm@latest --activate) || npm install -g pnpm",
    })
    // No-fatal (un throw tira el deploy), pero sin silenciar el error.
    await sandbox.run({
      command:
        "cd /tmp && (pnpm dlx playwright@1.61.1 install chromium --with-deps || pnpm dlx playwright@1.61.1 install chromium) || echo 'AVISO: chromium NO se precalento (capture lo intentara en runtime)'",
    })
    // ffmpeg: reducir las capturas full-page antes de mandarlas a visión.
    await sandbox.run({
      command:
        "command -v ffmpeg >/dev/null 2>&1 || (apt-get update -qq && apt-get install -yqq ffmpeg) >/dev/null 2>&1 || echo 'sin ffmpeg (se analiza el png completo)'",
    })
  },
})
