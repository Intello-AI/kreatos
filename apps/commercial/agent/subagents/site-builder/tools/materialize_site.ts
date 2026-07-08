import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { toolModel, toolModelLabel } from "../../../lib/tool-models"
import { recordToolTiming, recordToolUsage } from "../../../lib/tool-usage"
import assembleRegistry from "./assemble_registry"
import buildCheck from "./build_check"
import { draftOneSection, type DraftSectionInput } from "./draft_section"
import draftSurface from "./draft_surface"
import pushSiteVersion, { EDITABLE_PATHS } from "./push_site_version"
import reviewScreenshots from "./review_screenshots"
import runVisualQa from "./run_visual_qa"
import saveQaReport from "./save_qa_report"
import translateCopy from "./translate_copy"

/**
 * FASE 2 de la inversión de control: el tramo surfaces→review del build corre
 * COMO CÓDIGO, con el modelo solo en las hojas (dibujar secciones, transcribir
 * theme/fonts, traducir, reparar errores puntuales). Antes el orquestador
 * recorría ~40-80 tool-calls re-decidiendo cada peldaño — cada step recarga
 * ~240k de contexto y abre espacio para desviarse (medido: loop agéntico =
 * 74.8% del costo del build). Con esto el flujo del orquestador queda en ~3
 * turnos: (1) brief+clone+assets, (2) componer surfaces+briefs y llamar
 * materialize_site, (3) deploy_preview.
 *
 *   surfaces (4) → secciones EN PARALELO (retrieval de reference/blocks
 *   incluido) → registry determinista → traducciones → escalera rápida
 *   (validate+typecheck) con AUTO-REPAIR acotado (codegen, máx 2 rondas) →
 *   QA visual (next dev, sin build) → review de visión → save_qa_report.
 *
 * NO despliega: si el review aprueba, el orquestador llama deploy_preview
 * (build real + push con gates + await). Si algo no se puede reparar en
 * código, devuelve el estado exacto y el orquestador sigue con las tools
 * granulares (draft_section/edit_file/build_check) — el flujo viejo completo
 * sigue disponible como fallback.
 */

const SECTION_SHAPE = z.object({
  path: z
    .string()
    .regex(/^[\w./-]+$/)
    .describe("Ruta de la custom, p. ej. 'components/custom/hero-expediente.tsx'."),
  component: z
    .string()
    .regex(/^[A-Z][A-Za-z0-9_]*$/)
    .describe("Nombre del componente en PascalCase, casa con el archivo."),
  ns: z.string().describe("Namespace de next-intl de la sección."),
  archetype: z
    .string()
    .describe(
      "Arquetipo estructural DESCRIPTIVO (es la query del retrieval de reference/blocks): 'stat-wall diagonal con cifras enormes', no 'sección 2'.",
    ),
  brief: z
    .string()
    .min(40)
    .describe(
      "El diseño CONCRETO de ESTA sección (layout, keys de copy del ns, imágenes, gestos).",
    ),
  isSlot: z.boolean().optional().describe("true para header/footer (slot)."),
  useClient: z.boolean().optional().describe('true si necesita "use client".'),
})

/**
 * PRESUPUESTO DE FUNCIÓN (regla dura de plataforma): el agente corre en
 * Vercel Fluid con techo de 800s por invocación (el replay budget interno de
 * eve es 780s) — un tool que planee >~13 min MUERE con la plataforma, no con
 * un error propio (medido: materialize v1 murió a los ~16 min con glm-5.2 a
 * 74-307s por sección). Por eso este tool es RESUMIBLE: corta trabajo cuando
 * el presupuesto se acaba y devuelve `resume:true`; el orquestador lo
 * RE-LLAMA con el MISMO input y retoma en segundos — el estado vive en el
 *  SANDBOX (superficie escrita = no se reescribe; sección .tsx existente = se
 * salta).
 */
const BUDGET_MS = 540_000 // 9 min de trabajo por invocación
/**
 * No despachar secciones NUEVAS pasado este punto. Aritmética contra el techo
 * de 780s: cutoff (360s) + peor single-shot medido (~330s con glm-5.2) ≈ 690s
 * — cabe SIN reintento. Por eso el reintento de una sección se OMITE si ya se
 * pasó RETRY_DEADLINE (la sección vuelve como pendiente y la re-dibuja la
 * siguiente invocación con presupuesto fresco).
 */
const DISPATCH_CUTOFF_MS = 360_000
const RETRY_DEADLINE_MS = 400_000
/** Concurrencia de dibujado: cada sección es un request independiente. */
const CONCURRENCY = 12

/**
 * mapLimit con corte por presupuesto: los workers dejan de TOMAR items nuevos
 * pasado el cutoff; los no-despachados vuelven en `pending`.
 */
async function mapLimitBudget<T, R>(
  items: T[],
  limit: number,
  t0: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<{ results: R[]; pending: T[] }> {
  const results: R[] = []
  const pending: T[] = []
  let next = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= items.length) return
      if (Date.now() - t0 > DISPATCH_CUTOFF_MS) {
        pending.push(items[i])
        continue
      }
      results.push(await fn(items[i], i))
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return { results, pending }
}

function stripFences(text: string): string {
  const t = text.trim()
  const m = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(t)
  return m ? m[1] : t
}

export default defineTool({
  description:
    "MATERIALIZA EL SITIO (pipeline en código; el modelo solo en las hojas). FLUJO RECOMENDADO: (1) escribe las 4 superficies con draft_surface como siempre (config espejando el shape EXACTO del site.config.ts del clone: business.address.colonia, business.maps.uri, hours con open/close — NUNCA inventes campos), (2) llama materialize_site SIN `surfaces` — solo concept + defaultLocale + translations + el array de secciones con arquetipo+brief (cada una recupera SOLA su base de reference/blocks). NO re-emitas config/es.json dentro de este input: duplica minutos de streaming de tu salida (el tool verifica que las superficies existan en el sandbox). Corre: secciones en paralelo → registry → traducciones → validate+typecheck con auto-repair → QA visual (next dev) → review de visión → save_qa_report. ES RESUMIBLE: con `resume:true` (presupuesto de la invocación agotado) RE-LLÁMALO INMEDIATAMENTE con el MISMO input — retoma en segundos (lo ya escrito se salta); NO es error ni fin de turno. PRE-REQUISITOS: clone_site_repo + fetch_brand_assets + superficies escritas. NO despliega: con approved:true llama deploy_preview; con stage FALLIDO (failed/errors, distinto de resume) corrige con las tools granulares y sigue el flujo granular.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z.number().int().min(1),
    concept: z
      .string()
      .min(30)
      .describe(
        "design.concept del spec + 1-2 frases del gesto visible — lo juzga el review de visión.",
      ),
    defaultLocale: z
      .string()
      .min(2)
      .describe('Locale default del sitio (locales[0] del spec), p. ej. "es".'),
    surfaces: z
      .object({
        siteConfig: z
          .string()
          .min(200)
          .describe(
            "site.config.ts COMPLETO (import type SiteConfig … export default config), ya compuesto por ti con los datos REALES del lead.",
          ),
        messagesJson: z
          .string()
          .min(200)
          .describe(
            "messages/<defaultLocale>.json COMPLETO (JSON válido, con namespace 'common' y TODOS los namespaces del sitio).",
          ),
        themeCss: z
          .string()
          .min(100)
          .describe(
            "Valores FINALES del theme (paleta oklch exacta, radius, overlay, og-*) o el theme.css completo — lo transcribe el modelo barato respetando la estructura del base.",
          ),
        fontsTs: z
          .string()
          .min(50)
          .describe(
            "Fuentes finales (familias display/body de next/font/google con sus axes/weights) o el fonts.ts completo.",
          ),
      })
      .optional()
      .describe(
        "OMÍTELO si ya escribiste las 4 superficies con draft_surface (el camino RECOMENDADO: re-emitir aquí el es.json/config completos duplica MINUTOS de streaming de tu salida). Sin surfaces, el tool VERIFICA que existan en el sandbox y salta directo a las secciones.",
      ),
    translations: z
      .array(
        z.object({
          locale: z.string().min(2).describe('Locale destino, p. ej. "en".'),
          languageName: z
            .string()
            .min(3)
            .describe('Nombre del idioma en español, p. ej. "inglés".'),
        }),
      )
      .optional()
      .describe(
        "Locales adicionales a traducir desde el default (omite si el sitio es monolingüe).",
      ),
    sections: z
      .array(SECTION_SHAPE)
      .min(1)
      .max(24)
      .describe("TODAS las secciones custom del sitio (home + interiores)."),
  }),
  async execute(
    { siteId, versionN, concept, defaultLocale, surfaces, translations, sections },
    ctx,
  ) {
    const t0 = Date.now()
    const timeLeft = () => BUDGET_MS - (Date.now() - t0)
    const sandbox = await ctx.getSandbox()
    const finish = async <T extends { stage: string; ok: boolean }>(
      result: T,
    ): Promise<T> => {
      void recordToolTiming(ctx, "site-builder", "materialize_site", Date.now() - t0, {
        ok: result.ok,
        meta: {
          stage: result.stage,
          sections: sections.length,
          resume: "resume" in result ? Boolean((result as { resume?: boolean }).resume) : false,
        },
      })
      return result
    }
    // AUTO-CHECKPOINT (en CÓDIGO, no fe en el modelo): la clase de pérdida #1
    // medida en prod es un run que muere/reporta sin checkpointear — TODO el
    // trabajo del sandbox se va con él y el siguiente run reinicia de cero
    // (Human Security: 3 arranques desde template virgen en una mañana). El
    // pipeline checkpointea SOLO en cada hito; best-effort (no tumba el flujo).
    const checkpoint = async (msg: string): Promise<void> => {
      try {
        await pushSiteVersion.execute(
          {
            siteId,
            versionN,
            commitMessage: msg,
            checkpoint: true,
            overrideReview: false,
            copyOnly: false,
          },
          ctx,
        )
      } catch {
        // best-effort: un checkpoint fallido no detiene la materialización
      }
    }

    // Presupuesto agotado ANTES de un stage caro → checkpoint + resume (NO es
    // error: el orquestador re-llama con el mismo input y el stage corre
    // fresco; si el run muere en medio, el checkpoint preserva el sandbox).
    const resumeAt = async (stage: string, done: string[]) => {
      await checkpoint(`materialize_site: avance hasta ${done[done.length - 1] ?? "inicio"} (resume en ${stage})`)
      return finish({
        ok: true as const,
        stage,
        resume: true as const,
        done,
        hint: `Presupuesto de esta invocación agotado ANTES de "${stage}" (techo de función de la plataforma). RE-LLAMA materialize_site AHORA MISMO con el MISMO input: lo ya hecho (${done.join(", ")}) se salta en segundos y retoma en "${stage}". No es un error ni un fin de turno.`,
      })
    }

    const pkg = await sandbox.readTextFile({ path: "site/package.json" })
    if (pkg == null) {
      throw new Error(
        "No hay site/package.json en el sandbox: corre clone_site_repo (y fetch_brand_assets) antes de materialize_site.",
      )
    }

    // ── 1. SUPERFICIES ─────────────────────────────────────────────────────
    // Camino RECOMENDADO: el orquestador ya las escribió con draft_surface
    // (streamear el es.json/config completos DENTRO de este input costaba
    // minutos de salida del orquestador y los pagaba DOBLE). Sin `surfaces`,
    // aquí solo se VERIFICA que existan y no sean el demo.
    if (surfaces) {
      await draftSurface.execute(
        { surface: "site-config", path: "site.config.ts", content: surfaces.siteConfig },
        ctx,
      )
      await draftSurface.execute(
        {
          surface: "es-json",
          path: `messages/${defaultLocale}.json`,
          content: surfaces.messagesJson,
        },
        ctx,
      )
      await Promise.all([
        draftSurface.execute(
          { surface: "theme-css", path: "app/theme.css", content: surfaces.themeCss },
          ctx,
        ),
        draftSurface.execute(
          { surface: "fonts", path: "app/fonts.ts", content: surfaces.fontsTs },
          ctx,
        ),
      ])
    } else {
      const [config, messages] = await Promise.all([
        sandbox.readTextFile({ path: "site/site.config.ts" }),
        sandbox.readTextFile({ path: `site/messages/${defaultLocale}.json` }),
      ])
      const missing = [
        !config ? "site.config.ts" : null,
        config && /l[óo]pez y asociados/i.test(config)
          ? "site.config.ts (sigue siendo el DEMO)"
          : null,
        !messages ? `messages/${defaultLocale}.json` : null,
      ].filter((s): s is string => Boolean(s))
      if (missing.length > 0) {
        throw new Error(
          `Omitiste \`surfaces\` pero el sandbox no tiene las superficies listas: ${missing.join(", ")}. Escríbelas primero con draft_surface (config, es.json, theme, fonts) y re-llama materialize_site sin surfaces — o pásalas en el input.`,
        )
      }
    }

    // ── 2. SECCIONES EN PARALELO (con retrieval de reference/blocks) ──────
    // RESUME: una sección cuyo .tsx ya existe en el sandbox se salta — es lo
    // que hace idempotente re-llamar este tool tras un corte de presupuesto.
    const already: string[] = []
    const toDraft: DraftSectionInput[] = []
    for (const section of sections as DraftSectionInput[]) {
      const rel = section.path.replace(/^(\/workspace\/)?site\//, "")
      const existing = await sandbox.readTextFile({ path: `site/${rel}` })
      if (existing && existing.trim().length > 0) already.push(section.path)
      else toDraft.push(section)
    }
    const budgetPending: DraftSectionInput[] = []
    const { results: settled, pending: undispatched } = await mapLimitBudget(
      toDraft,
      CONCURRENCY,
      t0,
      async (section) => {
        try {
          const res = await draftOneSection(
            { ...section, retryDeadline: t0 + RETRY_DEADLINE_MS },
            ctx,
          )
          return { ok: true as const, res }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          // Reintento omitido por presupuesto: NO es un fallo de validación —
          // la sección vuelve como pendiente para la siguiente invocación.
          if (msg.includes("__BUDGET__")) {
            budgetPending.push(section)
            return { ok: true as const, res: null }
          }
          return {
            ok: false as const,
            path: section.path,
            component: section.component,
            error: msg,
          }
        }
      },
    )
    const pending = [...undispatched, ...budgetPending]
    if (pending.length > 0) {
      const drafted = settled.filter((s) => s.ok && s.res !== null).length
      await checkpoint(
        `materialize_site: superficies + ${drafted + already.length} sección(es) (faltan ${pending.length})`,
      )
      return finish({
        ok: true as const,
        stage: "sections" as const,
        resume: true as const,
        drafted,
        skipped: already.length,
        pendingSections: pending.map((p) => p.path),
        hint: `Presupuesto de esta invocación agotado: quedaron ${pending.length} sección(es) sin dibujar (las ${drafted + already.length} restantes YA están en el sandbox y se saltarán). RE-LLAMA materialize_site AHORA MISMO con el MISMO input — retoma exactamente donde quedó. No es un error ni un fin de turno.`,
      })
    }
    const failed = settled.filter(
      (s): s is { ok: false; path: string; component: string; error: string } =>
        !s.ok,
    )
    if (failed.length > 0) {
      await checkpoint(
        `materialize_site: superficies + secciones parciales (${failed.length} fallidas)`,
      )
      return finish({
        ok: false,
        stage: "sections" as const,
        failed: failed.map(({ path, component, error }) => ({ path, component, error })),
        written: settled.filter((s) => s.ok && s.res !== null).length + already.length,
        hint: `${failed.length} sección(es) no validaron ni con reintento. Escríbelas con draft_section (una a una, ajustando el brief) o write_file, y CONTINÚA con el flujo granular: assemble_registry → translate_copy → build_check {skipBuild:true} → run_visual_qa → review_screenshots → save_qa_report → deploy_preview. NO re-llames materialize_site (redibujaría todo lo que ya quedó).`,
      })
    }

    // ── 3. REGISTRY (determinista) ─────────────────────────────────────────
    await assembleRegistry.execute({}, ctx)
    // Hito mayor: superficies + TODAS las secciones + registry en el repo.
    await checkpoint("materialize_site: superficies + secciones + registry completos")

    // ── 4. TRADUCCIONES (incrementales) ────────────────────────────────────
    // Primera corrida completa ≈ 3-4 min con el modelo barato: gate de budget.
    if ((translations?.length ?? 0) > 0 && timeLeft() < 240_000) {
      return resumeAt("translations", ["surfaces", "sections", "registry"])
    }
    for (const t of translations ?? []) {
      await translateCopy.execute(
        {
          targetLocale: t.locale,
          targetLanguageName: t.languageName,
          sourceLocale: defaultLocale,
        },
        ctx,
      )
    }

    // ── 5. ESCALERA RÁPIDA + AUTO-REPAIR ACOTADO ───────────────────────────
    // validate-config + typecheck (segundos; el build real va en deploy_preview).
    // Rojo → el modelo de codegen repara SOLO los archivos señalados (superficies
    // editables), máx 2 rondas. Contexto mínimo: errores + archivos — nada del
    // historial del orquestador.
    if (timeLeft() < 180_000) {
      return resumeAt("build_check", [
        "surfaces",
        "sections",
        "registry",
        "translations",
      ])
    }
    let check = await buildCheck.execute({ skipInstall: false, skipBuild: true }, ctx)
    for (let round = 0; !check.ok && round < 2; round++) {
      const files = ("files" in check ? (check.files ?? []) : [])
        .filter(
          (p) =>
            !p.startsWith(".agent/") && EDITABLE_PATHS.some((re) => re.test(p)),
        )
        .slice(0, 4)
      if (files.length === 0) break
      const contents = await Promise.all(
        files.map(async (p) => ({
          path: p,
          content: (await sandbox.readTextFile({ path: `site/${p}` })) ?? "",
        })),
      )
      const errors = "errors" in check ? (check.errors ?? []) : []
      const repairPrompt = `Corrige estos errores de un sitio Next.js (App Router, next-intl, Tailwind v4). Los archivos de abajo son la ÚNICA superficie que puedes tocar.

ERRORES (de validate-config/tsc):
${errors.join("\n")}

ARCHIVOS ACTUALES:
${contents.map((c) => `--- ${c.path} ---\n${c.content.slice(0, 30_000)}`).join("\n\n")}

Reglas: corrige la CAUSA (key faltante en el JSON de copy, tipo mal, token inválido) sin rediseñar nada; JSON de messages debe seguir siendo JSON válido con las mismas keys más las que falten; no toques imports del motor. Devuelve SOLO un JSON: [{"path": "<ruta tal cual>", "content": "<archivo completo corregido>"}] con ÚNICAMENTE los archivos que cambies. Sin markdown fences.`
      const model = toolModel("codegen")
      const res = await generateText({ model, prompt: repairPrompt })
      await recordToolUsage(ctx, "site-builder", toolModelLabel("codegen"), res.usage)
      let patches: Array<{ path: string; content: string }> = []
      try {
        const parsed = JSON.parse(stripFences(res.text))
        if (Array.isArray(parsed)) patches = parsed
      } catch {
        break // salida no parseable: sin reparación, que decida el orquestador
      }
      let applied = 0
      for (const patch of patches) {
        if (
          !patch ||
          typeof patch.path !== "string" ||
          typeof patch.content !== "string" ||
          !files.includes(patch.path)
        )
          continue
        if (patch.path.endsWith(".json")) {
          try {
            JSON.parse(patch.content)
          } catch {
            continue // un repair que rompe el JSON no se aplica
          }
        }
        await sandbox.writeTextFile({ path: `site/${patch.path}`, content: patch.content })
        applied++
      }
      if (applied === 0) break
      check = await buildCheck.execute({ skipInstall: true, skipBuild: true }, ctx)
    }
    if (!check.ok) {
      await checkpoint("materialize_site: sitio completo, escalera roja (a reparar)")
      return finish({
        ...check,
        ok: false as const,
        stage: "build_check" as const,
        hint: `El auto-repair no dejó verde la escalera (rung "${"rung" in check ? check.rung : "?"}"). Parcha con edit_file los archivos listados, re-llama build_check {skipBuild:true} y CONTINÚA con el flujo granular (run_visual_qa → review_screenshots → save_qa_report → deploy_preview). NO re-llames materialize_site.`,
      })
    }
    // Escalera verde: el estado más valioso del build — asegurado.
    await checkpoint("materialize_site: escalera verde (validate + typecheck)")

    // ── 6. QA VISUAL (next dev, sin build) ─────────────────────────────────
    // Server + compiles de dev + capturas ≈ 3-5 min: gate de budget.
    if (timeLeft() < 330_000) {
      return resumeAt("visual_qa", [
        "surfaces",
        "sections",
        "registry",
        "translations",
        "build_check",
      ])
    }
    const qa = await runVisualQa.execute({ routes: undefined }, ctx)
    if (!qa.validateConfigOk || qa.screenshots.length === 0) {
      return finish({
        ok: false,
        stage: "visual_qa" as const,
        qa,
        hint: "El QA visual no dejó capturas válidas (revisa steps/failedRoutes). Corrige y continúa con el flujo granular desde run_visual_qa.",
      })
    }

    // ── 7. REVIEW DE VISIÓN + REPORTE ──────────────────────────────────────
    const review = await reviewScreenshots.execute(
      { concept, maxImages: 6, routes: undefined, referenceScreenshotUrl: undefined },
      ctx,
    )
    const reportRaw = await sandbox.run({
      command: `cat site/.qa/qa-report.json 2>/dev/null || echo '{}'`,
    })
    let qaReport: Record<string, unknown> = {}
    try {
      qaReport = JSON.parse(reportRaw.stdout.trim())
    } catch {
      qaReport = {}
    }
    await saveQaReport.execute({ siteId, versionN, qaReport }, ctx)

    const approved = Boolean(
      (review as { review?: { approved?: boolean } }).review?.approved,
    )
    return finish({
      ok: true,
      stage: "review" as const,
      approved,
      review,
      screenshots: qa.screenshots,
      hint: approved
        ? "Review APROBADO y qa-report guardado. Llama deploy_preview {siteId, versionN, commitMessage} para build real + push + preview — y terminas."
        : "Review NO aprobó (issues arriba). UNA sola ronda de fixes: corrige los issues con edit_file, re-corre run_visual_qa (routes afectadas) + review_screenshots; si la segunda review sigue rechazando por CRITERIO (no structural), entrega con deploy_preview {overrideReview:true}. No entres en loop de rediseños.",
    })
  },
})
