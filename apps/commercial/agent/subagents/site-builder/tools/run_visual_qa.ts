import { defineTool } from "eve/tools"
import { z } from "zod"

/**
 * Colapsa TODA la orquestación de QA visual en UNA llamada. Antes el agente
 * corría 4-6 comandos de shell en steps SEPARADOS de Sonnet (screenshots:serve
 * → screenshots:page × N → screenshots:stop → qa), y cada step re-carga ~240k
 * de contexto cacheado por una acción mecánica de ~130 tokens — medido: ~43-55%
 * de los steps de un build son mecánicos así. Este tool corre esos MISMOS
 * comandos cortos como sandbox.run() internos (nunca el modo monolítico que
 * moría por timeout), en un solo round-trip. El server de QA es detached
 * (persiste entre comandos vía .qa/next.pid), igual que el flujo por pasos.
 */
export default defineTool({
  description:
    "Corre TODO el QA visual del sitio en UNA llamada: arranca el server persistente, captura cada ruta (desktop/mobile + dark en home si hay toggle), lo detiene y consolida .qa/qa-report.json. Reemplaza la secuencia manual screenshots:serve → screenshots:page × N → screenshots:stop → qa (4-6 comandos). REQUIERE `pnpm build` verde previo (usa .next). Devuelve ok/rutas/capturas + fallas de validate-config. Después: pásalo por `review_screenshots` (visión, GATE) con el design.concept, y `save_qa_report`.",
  inputSchema: z.object({
    routes: z
      .array(z.string().startsWith("/"))
      .optional()
      .describe(
        "Re-QA PARCIAL tras un fix puntual: captura SOLO estas rutas (la home '/' se incluye SIEMPRE para el juicio de monotonía). Omite en el QA inicial → captura TODAS las rutas del sitio. Recapturar las 7 rutas por un fix de una sección es tiempo tirado.",
      ),
  }),
  async execute({ routes: scopedRoutes }, ctx) {
    const sandbox = await ctx.getSandbox()

    const run = async (
      cmd: string,
      opts?: { allowFail?: boolean },
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
      const r = await sandbox.run({ command: `cd site && ${cmd}` })
      if (r.exitCode !== 0 && !opts?.allowFail) {
        throw new Error(
          `\`${cmd}\` falló (exit ${r.exitCode}): ${[r.stderr, r.stdout]
            .filter(Boolean)
            .join("\n")
            .slice(-800)}`,
        )
      }
      return r
    }

    // Pre-check: el build debe existir (el flujo del agente garantiza un
    // `pnpm build` verde antes de QA). Sin .next, `next start` no arranca.
    const built = await sandbox.run({
      command: `test -f site/.next/BUILD_ID && echo __BUILT__ || echo __NOBUILD__`,
    })
    if (!built.stdout.includes("__BUILT__")) {
      throw new Error(
        "No hay build (site/.next/BUILD_ID ausente). Corre `pnpm build` verde ANTES de run_visual_qa — el QA visual necesita `next start`.",
      )
    }

    // QA completo: capturas limpias (quita PNG stale de rutas que ya no existen,
    // que confundirían al reviewer). Re-QA parcial: NO borrar — se conservan las
    // rutas no reevaluadas y solo se sobreescriben las re-capturadas (nombres
    // deterministas por slug). No toca review.json ni qa-report.json.
    if (!scopedRoutes || scopedRoutes.length === 0) {
      await sandbox.run({ command: `rm -rf site/.qa/screenshots` })
    }

    // 1. Rutas a capturar. Re-QA parcial: solo las pasadas + home siempre.
    //    QA inicial: todas las del sitio (JSON, sin correr el modo monolítico).
    let routes: string[]
    if (scopedRoutes && scopedRoutes.length > 0) {
      routes = Array.from(new Set(["/", ...scopedRoutes]))
    } else {
      const routesRes = await run("pnpm screenshots -- --print-routes")
      routes = ["/"]
      const marker = routesRes.stdout
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("__ROUTES__"))
      if (marker) {
        try {
          const parsed = JSON.parse(marker.slice("__ROUTES__".length))
          if (Array.isArray(parsed) && parsed.length > 0) routes = parsed
        } catch {
          // se queda con ["/"]: al menos captura la home
        }
      }
    }

    // 2. Server de QA persistente (detached; sobrevive entre los sandbox.run).
    await run("pnpm screenshots:serve")

    // 3. Una ruta por comando CORTO — así ningún comando rebasa el timeout del
    //    sandbox (la razón de que el monolítico muriera "en terminated").
    const captured: string[] = []
    const failed: string[] = []
    try {
      for (const route of routes) {
        const r = await run(`pnpm screenshots:page -- --route ${route}`, {
          allowFail: true,
        })
        if (r.exitCode === 0) captured.push(route)
        else failed.push(route)
      }
    } finally {
      // 4. SIEMPRE matar el server, aunque una captura truene.
      await run("pnpm screenshots:stop", { allowFail: true })
    }

    // 5. Consolidar: validate-config + verifica que existan las capturas.
    //    Puede salir 1 si validate-config falla — eso es señal para el agente,
    //    no un error del tool.
    const qaRes = await run("pnpm qa --skip-build --skip-screenshots", {
      allowFail: true,
    })

    // 6. Leer el reporte + listar las capturas para el review visual.
    const reportRaw = await sandbox.run({
      command: `cat site/.qa/qa-report.json 2>/dev/null || echo '{}'`,
    })
    let report: {
      ok?: boolean
      steps?: Array<{ name?: string; ok?: boolean; outputTail?: string }>
    } = {}
    try {
      report = JSON.parse(reportRaw.stdout.trim())
    } catch {
      // reporte ilegible: se refleja en validateOk/steps vacíos
    }
    const shotsRes = await sandbox.run({
      command: `ls site/.qa/screenshots/*.png 2>/dev/null | xargs -n1 basename 2>/dev/null || true`,
    })
    const screenshots = shotsRes.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)

    return {
      ok: report.ok ?? false,
      validateConfigOk: qaRes.exitCode === 0,
      routes,
      capturedRoutes: captured,
      ...(failed.length > 0 ? { failedRoutes: failed } : {}),
      screenshots,
      steps: (report.steps ?? []).map((s) => ({
        name: s.name,
        ok: s.ok,
        tail: s.outputTail?.slice(-400),
      })),
      hint:
        screenshots.length > 0
          ? "QA visual completo. AHORA pásalo por `review_screenshots` (director de arte con visión, GATE del push) con el design.concept del spec; luego `save_qa_report`. Si validateConfigOk=false, arregla config/keys y vuelve a correr run_visual_qa."
          : "No se generaron capturas. Verifica que el build esté verde y que chromium esté instalado en el sandbox (revisa failedRoutes/steps).",
    }
  },
})
