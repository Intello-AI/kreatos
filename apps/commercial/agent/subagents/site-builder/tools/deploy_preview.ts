import { defineTool } from "eve/tools"
import { z } from "zod"

import awaitPreviewDeployment from "./await_preview_deployment"
import buildCheck from "./build_check"
import pushSiteVersion, { EDITABLE_PATHS } from "./push_site_version"

/**
 * "Deploy" NO es una decisión creativa: es una escalera fija (motor limpio →
 * build ladder → push con gates → esperar el deployment). Antes el modelo la
 * recorría en 3-6 tool-calls separadas — cada una recargando contexto y con
 * espacio para desviarse (el deadlock de Sixcal: revertir motor ↔ typecheck
 * rojo ↔ push rechazado, en círculo, sin terminar nunca). Este tool colapsa
 * TODO en UNA llamada determinista:
 *
 *   1. MOTOR-SYNC: trae origin/main y revierte automáticamente cualquier
 *      archivo de MOTOR tocado (checkout origin/main -- <files>; los nuevos
 *      sin trackear se borran). Es el mismo recovery que el guard de push
 *      exigía a mano — automatizado, el deadlock de motor desaparece de raíz.
 *   2. build_check (install si falta → validate-config → typecheck → build).
 *      Rojo → devuelve los errores parseados y NO avanza: parcha y re-llama.
 *   3. push_site_version (rama v{N}, con TODOS sus gates: anti-demo, QA,
 *      review visual — siguen aplicando).
 *   4. await_preview_deployment con el commitSha del push.
 *
 * El agente lo llama UNA vez al final del flujo (tras QA + review) o para un
 * re-deploy. Los gates NO se relajan: viven en push_site_version.
 */

export default defineTool({
  description:
    "DEPLOY EN UNA LLAMADA (determinista, sin decisiones): sincroniza el motor con origin/main (revierte automáticamente archivos de motor tocados — ya no hay que hacer el recovery a mano), corre la escalera build_check, pushea la rama v{N} (con TODOS los gates de push_site_version: QA report + review visual siguen siendo obligatorios) y espera el deployment preview en Vercel. ÚSALO en vez de la secuencia manual build_check→push_site_version→await_preview_deployment: un solo turno. Si devuelve ok:false con stage 'build_check', parcha los archivos listados con edit_file y RE-LLAMA deploy_preview — no es fin de turno. Requiere qa-report guardado (save_qa_report) y review visual previo, igual que siempre. Para checkpoints WIP sigue usando push_site_version con checkpoint:true.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z.number().int().min(1),
    commitMessage: z
      .string()
      .min(10)
      .describe("Mensaje de commit descriptivo de la versión."),
    overrideReview: z
      .boolean()
      .default(false)
      .describe(
        "Passthrough a push_site_version: solo tras UNA ronda de rediseño real con review reprobado por criterio subjetivo. Nunca salta criticals estructurales.",
      ),
    copyOnly: z
      .boolean()
      .default(false)
      .describe(
        "Passthrough a push_site_version: edit de SOLO texto (messages/*.json) que salta el QA visual. El tool verifica el claim.",
      ),
    skipInstall: z
      .boolean()
      .optional()
      .describe("Passthrough a build_check: true si ya instalaste en este turno."),
  }),
  async execute(
    { siteId, versionN, commitMessage, overrideReview, copyOnly, skipInstall },
    ctx,
  ) {
    const sandbox = await ctx.getSandbox()

    const pkg = await sandbox.readTextFile({ path: "site/package.json" })
    if (pkg == null) {
      throw new Error(
        "No hay site/package.json en el sandbox. Clona el repo (clone_site_repo) y materializa antes de deploy_preview.",
      )
    }

    // ── 1. MOTOR-SYNC ──────────────────────────────────────────────────────
    // Compara contra origin/main FRESCO (el clone puede ser anterior a un fix
    // del motor en el remoto — el caso Sixcal) y revierte lo que toque motor.
    await sandbox.run({
      command: `cd site && git fetch -q origin main 2>/dev/null; true`,
    })
    const changed = await sandbox.run({
      command: `cd site && git diff origin/main --name-only 2>/dev/null; git status --porcelain`,
    })
    const tracked: string[] = []
    const untracked: string[] = []
    for (const line of changed.stdout.split("\n")) {
      const isPorcelain = /^[A-Z?! ]{2} /.test(line)
      if (isPorcelain) {
        if (!line.startsWith("??")) continue
        const p = line.slice(3).trim()
        if (p) untracked.push(p.includes(" -> ") ? p.split(" -> ")[1] : p)
      } else {
        const p = line.trim()
        if (p) tracked.push(p)
      }
    }
    const isEngine = (p: string) =>
      !p.startsWith(".agent/") && !EDITABLE_PATHS.some((re) => re.test(p))
    const engineTracked = [...new Set(tracked.filter(isEngine))]
    const engineUntracked = [...new Set(untracked.filter(isEngine))].filter(
      (p) => !engineTracked.includes(p),
    )
    const motorSynced: string[] = []
    if (engineTracked.length > 0) {
      const list = engineTracked.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(" ")
      const revert = await sandbox.run({
        command: `cd site && git checkout origin/main -- ${list}`,
      })
      if (revert.exitCode !== 0) {
        throw new Error(
          `Motor-sync falló al revertir ${engineTracked.join(", ")}:\n${[revert.stderr, revert.stdout].filter(Boolean).join("\n").slice(-800)}`,
        )
      }
      motorSynced.push(...engineTracked)
    }
    if (engineUntracked.length > 0) {
      // Archivos NUEVOS fuera de las superficies del contrato: no existen en
      // main, no se pueden "revertir" — se eliminan (el motor no crece).
      const list = engineUntracked
        .map((p) => `'${p.replace(/'/g, "'\\''")}'`)
        .join(" ")
      await sandbox.run({ command: `cd site && rm -rf -- ${list}` })
      motorSynced.push(...engineUntracked)
    }

    // ── 2. BUILD LADDER ────────────────────────────────────────────────────
    const check = await buildCheck.execute({ skipInstall }, ctx)
    if (!check.ok) {
      return {
        ...check,
        ok: false as const,
        stage: "build_check" as const,
        ...(motorSynced.length > 0 ? { motorSynced } : {}),
        hint:
          `deploy_preview se detuvo en build_check (rung "${"rung" in check ? check.rung : "?"}"). ` +
          `Parcha con edit_file los archivos listados y RE-LLAMA deploy_preview (con skipInstall:true) — no es fin de turno ni pregunta al humano.`,
      }
    }

    // ── 3. PUSH (con todos sus gates) ──────────────────────────────────────
    const pushed = await pushSiteVersion.execute(
      {
        siteId,
        versionN,
        commitMessage,
        checkpoint: false,
        overrideReview,
        copyOnly,
      },
      ctx,
    )
    if ("skipped" in pushed && pushed.skipped) {
      // No debería pasar con checkpoint:false, pero por si el tipo lo permite.
      throw new Error("push_site_version no entregó commit (skipped).")
    }

    // ── 4. DEPLOYMENT ──────────────────────────────────────────────────────
    const deployment = await awaitPreviewDeployment.execute(
      { siteId, versionN, commitSha: pushed.commitSha },
      ctx,
    )

    return {
      ok: deployment.state === "READY",
      stage: "deployment" as const,
      state: deployment.state,
      previewUrl: deployment.previewUrl ?? null,
      branch: pushed.branch,
      commitSha: pushed.commitSha,
      ...(motorSynced.length > 0 ? { motorSynced } : {}),
      ...("deliveredWithOpenIssues" in pushed && pushed.deliveredWithOpenIssues
        ? { deliveredWithOpenIssues: pushed.deliveredWithOpenIssues }
        : {}),
      ...("buildLog" in deployment && deployment.buildLog
        ? { buildLog: deployment.buildLog }
        : {}),
      hint:
        deployment.state === "READY"
          ? `Preview desplegado: ${deployment.previewUrl}. El status del site ya quedó en 'preview'. Reporta la URL en tu respuesta final.`
          : deployment.state === "TIMEOUT"
            ? "El deployment no llegó a READY en 6 min. Re-llama deploy_preview (reusa el push: working tree limpio hace no-op el commit) o revisa get_deployment_logs."
            : "El build de Vercel falló — buildLog trae la causa. Corrige con edit_file, y re-llama deploy_preview.",
    }
  },
})
