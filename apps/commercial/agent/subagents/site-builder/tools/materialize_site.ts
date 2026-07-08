import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { toolModel, toolModelLabel } from "../../../lib/tool-models"
import { recordToolTiming, recordToolUsage } from "../../../lib/tool-usage"
import assembleRegistry from "./assemble_registry"
import buildCheck from "./build_check"
import { draftOneSection, type DraftSectionInput } from "./draft_section"
import draftSurface from "./draft_surface"
import { EDITABLE_PATHS } from "./push_site_version"
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

/** Concurrencia de dibujado (mismo tope que draft_sections). */
const CONCURRENCY = 5

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

function stripFences(text: string): string {
  const t = text.trim()
  const m = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(t)
  return m ? m[1] : t
}

export default defineTool({
  description:
    "MATERIALIZA EL SITIO COMPLETO EN UNA LLAMADA (pipeline en código; el modelo solo en las hojas). Le pasas TODO lo que ya decidiste leyendo el spec: las 4 superficies (site.config.ts y messages/<default>.json COMPLETOS; valores finales de theme/fonts), las traducciones, y el array de secciones con arquetipo+brief (cada una recupera SOLA su base de reference/blocks). El tool corre: superficies → secciones en paralelo → registry → traducciones → validate+typecheck con auto-repair acotado → QA visual (next dev, sin build) → review de visión → save_qa_report. PRE-REQUISITOS: clone_site_repo + fetch_brand_assets ya corridos (necesitas el imageManifest para componer los briefs). NO despliega: si devuelve approved:true, llama deploy_preview; si devuelve un stage fallido, corrige con las tools granulares (draft_section/edit_file) y retoma el flujo granular desde ese punto (NO re-llames materialize_site completo: redibujaría todo). Reemplaza a: draft_surface×4 + draft_sections + assemble_registry + translate_copy + build_check + run_visual_qa + review_screenshots + save_qa_report como llamadas separadas.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z.number().int().min(1),
    concept: z
      .string()
      .min(30)
      .describe(
        "design.concept del spec + 1-2 frases del gesto visible — lo juzga el review de visión.",
      ),
    surfaces: z.object({
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
      defaultLocale: z
        .string()
        .min(2)
        .describe('Locale default del sitio (locales[0] del spec), p. ej. "es".'),
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
    }),
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
    { siteId, versionN, concept, surfaces, translations, sections },
    ctx,
  ) {
    const t0 = Date.now()
    const sandbox = await ctx.getSandbox()
    const finish = async <T extends { stage: string; ok: boolean }>(
      result: T,
    ): Promise<T> => {
      void recordToolTiming(ctx, "site-builder", "materialize_site", Date.now() - t0, {
        ok: result.ok,
        meta: { stage: result.stage, sections: sections.length },
      })
      return result
    }

    const pkg = await sandbox.readTextFile({ path: "site/package.json" })
    if (pkg == null) {
      throw new Error(
        "No hay site/package.json en el sandbox: corre clone_site_repo (y fetch_brand_assets) antes de materialize_site.",
      )
    }

    // ── 1. SUPERFICIES ─────────────────────────────────────────────────────
    // Reusa draft_surface: pass-through validado para config/es.json,
    // transcriptor barato para theme/fonts. Config y copy primero (los guards
    // anti-demo aplican); theme/fonts en paralelo después.
    await draftSurface.execute(
      { surface: "site-config", path: "site.config.ts", content: surfaces.siteConfig },
      ctx,
    )
    await draftSurface.execute(
      {
        surface: "es-json",
        path: `messages/${surfaces.defaultLocale}.json`,
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

    // ── 2. SECCIONES EN PARALELO (con retrieval de reference/blocks) ──────
    const settled = await mapLimit(
      sections as DraftSectionInput[],
      CONCURRENCY,
      async (section) => {
        try {
          const res = await draftOneSection(section, ctx)
          return { ok: true as const, res }
        } catch (e) {
          return {
            ok: false as const,
            path: section.path,
            component: section.component,
            error: e instanceof Error ? e.message : String(e),
          }
        }
      },
    )
    const failed = settled.filter(
      (s): s is { ok: false; path: string; component: string; error: string } =>
        !s.ok,
    )
    if (failed.length > 0) {
      return finish({
        ok: false,
        stage: "sections" as const,
        failed: failed.map(({ path, component, error }) => ({ path, component, error })),
        written: settled.filter((s) => s.ok).length,
        hint: `${failed.length} sección(es) no validaron ni con reintento. Escríbelas con draft_section (una a una, ajustando el brief) o write_file, y CONTINÚA con el flujo granular: assemble_registry → translate_copy → build_check {skipBuild:true} → run_visual_qa → review_screenshots → save_qa_report → deploy_preview. NO re-llames materialize_site (redibujaría todo lo que ya quedó).`,
      })
    }

    // ── 3. REGISTRY (determinista) ─────────────────────────────────────────
    await assembleRegistry.execute({}, ctx)

    // ── 4. TRADUCCIONES (incrementales) ────────────────────────────────────
    for (const t of translations ?? []) {
      await translateCopy.execute(
        {
          targetLocale: t.locale,
          targetLanguageName: t.languageName,
          sourceLocale: surfaces.defaultLocale,
        },
        ctx,
      )
    }

    // ── 5. ESCALERA RÁPIDA + AUTO-REPAIR ACOTADO ───────────────────────────
    // validate-config + typecheck (segundos; el build real va en deploy_preview).
    // Rojo → el modelo de codegen repara SOLO los archivos señalados (superficies
    // editables), máx 2 rondas. Contexto mínimo: errores + archivos — nada del
    // historial del orquestador.
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
      return finish({
        ...check,
        ok: false as const,
        stage: "build_check" as const,
        hint: `El auto-repair no dejó verde la escalera (rung "${"rung" in check ? check.rung : "?"}"). Parcha con edit_file los archivos listados, re-llama build_check {skipBuild:true} y CONTINÚA con el flujo granular (run_visual_qa → review_screenshots → save_qa_report → deploy_preview). NO re-llames materialize_site.`,
      })
    }

    // ── 6. QA VISUAL (next dev, sin build) ─────────────────────────────────
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
