import { defineTool } from "eve/tools"
import { z } from "zod"

import { recordToolTiming } from "../../../lib/tool-usage"

/**
 * Corre la escalera de verificación BARATO→CARO en UNA llamada y se detiene en
 * el primer rung rojo, devolviendo los errores YA PARSEADOS por archivo.
 *
 *   install (si falta node_modules) → validate-config → typecheck → build
 *
 * Antes el modelo corría los 4 comandos a mano en steps separados y leía el
 * stdout crudo. Un modelo barato ahí (a) gastaba un turno por comando, (b) ante
 * el ruido del build a veces PREGUNTABA al humano en vez de arreglar. Este tool
 * es dueño de la escalera: el modelo llama UNA vez, recibe {ok|errores por
 * archivo} y su ÚNICO trabajo es parchar y re-llamar. El resultado deja
 * explícito que un rung rojo NO es un fin de turno ni una pregunta.
 *
 * No auto-edita: los errores son de TU config/copy/diseño y el fix necesita
 * criterio (qué copy, qué layout). El tool localiza y encuadra; tú parchas con
 * edit_file. `build` verde es la precondición dura de run_visual_qa.
 */

const RUNGS = [
  { id: "validate-config", cmd: "pnpm validate-config" },
  { id: "typecheck", cmd: "pnpm typecheck" },
  { id: "build", cmd: "pnpm build" },
] as const

/** Extrae líneas de error legibles según el rung; dedup + cap. */
function parseErrors(rung: string, out: string): string[] {
  const lines = out.split("\n")
  let picked: string[]
  if (rung === "validate-config") {
    // "  - [custom] home sections[1]: el componente …"
    picked = lines.filter((l) => /^\s*-\s+/.test(l)).map((l) => l.trim())
  } else if (rung === "typecheck") {
    // tsc: "components/custom/x.tsx(12,5): error TS2322: …"
    picked = lines.filter((l) => /error TS\d+/.test(l)).map((l) => l.trim())
  } else {
    // next build: type error, módulo no resuelto, prerender, "Failed to compile".
    picked = lines
      .filter((l) =>
        /error TS\d+|Module not found|Failed to compile|Type error:|Error:|Unhandled|Cannot find|is not a function|Expected|Unexpected/.test(
          l,
        ),
      )
      .map((l) => l.trim())
  }
  // Dedup preservando orden; cap a 40 para no inflar el resultado.
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const l of picked) {
    if (l && !seen.has(l)) {
      seen.add(l)
      deduped.push(l)
    }
  }
  return deduped.slice(0, 40)
}

/** Archivos mencionados en los errores (para dirigir el fix). */
function filesFromErrors(errors: string[]): string[] {
  const files = new Set<string>()
  for (const e of errors) {
    // Rutas del repo: app/…, components/…, messages/…, site.config.ts, lib/…
    const m = e.match(
      /((?:app|components|messages|lib|scripts)\/[\w./-]+|site\.config\.ts|[\w-]+\.tsx?)/,
    )
    if (m) files.add(m[1])
  }
  return [...files].slice(0, 20)
}

export default defineTool({
  description:
    "Corre la escalera de verificación del sitio en UNA llamada barato→caro (install si falta → validate-config → typecheck → build), se detiene en el primer rung rojo y devuelve los errores YA PARSEADOS por archivo. ÚSALO en el paso 8 en vez de correr `pnpm validate-config`/`pnpm typecheck`/`pnpm build` a mano en steps separados: un solo turno, feedback dirigido. Si un rung falla, tu ÚNICO trabajo es parchar con edit_file los archivos que te devuelve y RE-LLAMAR build_check — un rung rojo NO es fin de turno ni pregunta al humano. Cuando devuelve ok:true (build verde) sigue a run_visual_qa. No auto-edita: el fix del copy/config/diseño lo decides tú.",
  inputSchema: z.object({
    skipInstall: z
      .boolean()
      .optional()
      .describe(
        "true = no intentes `pnpm install` aunque falte node_modules (si ya lo corriste en este turno). Por defecto instala solo si node_modules no existe.",
      ),
  }),
  async execute({ skipInstall }, ctx) {
    // Instrumentación (Fase 0): duración total + por-rung. Una fila por llamada
    // = un ciclo build-repair; los rungMs revelan cuánto pesa `pnpm build`.
    const t0 = Date.now()
    const rungMs: Record<string, number> = {}
    const finish = async <T extends { ok: boolean; rung?: string }>(
      result: T,
    ): Promise<T> => {
      void recordToolTiming(ctx, "site-builder", "build_check", Date.now() - t0, {
        ok: result.ok,
        meta: { rung: result.rung ?? (result.ok ? "ok" : "unknown"), rungMs },
      })
      return result
    }
    const sandbox = await ctx.getSandbox()

    // Confirma que el repo está clonado.
    const pkg = await sandbox.readTextFile({ path: "site/package.json" })
    if (pkg == null) {
      throw new Error(
        "No hay site/package.json en el sandbox. Clona el repo (clone_site_repo) antes de build_check.",
      )
    }

    // Guard ANTI-DEMO: si site.config.ts sigue con el negocio del template
    // (Despacho López y Asociados), NO materializaste — el build saldría verde
    // pero seria el SITIO EQUIVOCADO (el reviewer lo rechaza igual, tras gastar
    // todo el QA). Es el fallo del resume que trata el demo como "casi listo" y
    // solo tunea el hero. Falla temprano y barato, forzando re-materializar.
    const cfg = await sandbox.readTextFile({ path: "site/site.config.ts" })
    if (cfg && /l[óo]pez y asociados/i.test(cfg)) {
      return finish({
        ok: false,
        rung: "demo",
        errors: [
          'site.config.ts todavía es el DEMO del template ("Despacho López y Asociados"): el sitio NO está materializado.',
        ],
        files: ["site.config.ts", "messages/es.json", "components/custom/"],
        hint:
          "NO estás materializado: el repo trae el DEMO del template, no tu cliente (clonaste el template pelón y no reescribiste sus superficies). RE-MATERIALIZA COMPLETO desde el spec (.agent/spec.json / latestSpec): reescribe site.config.ts, messages/es.json, TODAS las custom sections y su registry con el contenido REAL del cliente, BORRANDO el demo — NUNCA parches el demo con replaces de nombre (dejaría el NAP/rating/social del despacho ficticio con otro nombre encima). Tunear el hero del demo NO es materializar. Luego re-llama build_check.",
      })
    }

    // install solo si hace falta (barato: evita re-instalar en cada llamada).
    if (!skipInstall) {
      const hasModules = await sandbox.run({
        command: "test -d site/node_modules && echo yes || echo no",
      })
      if (hasModules.stdout.trim() === "no") {
        const it0 = Date.now()
        const install = await sandbox.run({ command: "cd site && pnpm install" })
        rungMs.install = Date.now() - it0
        if (install.exitCode !== 0) {
          return finish({
            ok: false,
            rung: "install",
            errors: parseErrors(
              "build",
              `${install.stdout}\n${install.stderr}`,
            ),
            raw: `${install.stdout}\n${install.stderr}`.slice(-2000),
            hint: "`pnpm install` falló. Revisa el error (lockfile/registro) y re-llama build_check. No es fin de turno.",
          })
        }
      }
    }

    for (const rung of RUNGS) {
      const rt = Date.now()
      const res = await sandbox.run({ command: `cd site && ${rung.cmd}` })
      rungMs[rung.id] = Date.now() - rt
      if (res.exitCode !== 0) {
        const combined = `${res.stdout}\n${res.stderr}`
        const errors = parseErrors(rung.id, combined)
        return finish({
          ok: false,
          rung: rung.id,
          errors: errors.length > 0 ? errors : ["(sin líneas parseadas — ver raw)"],
          files: filesFromErrors(errors),
          raw: combined.slice(-2500),
          hint:
            `Rung "${rung.id}" ROJO. Parcha con edit_file los archivos de \`files\` (son TUS superficies: config/es.json/theme/custom), re-llama build_check. ` +
            `Un rung rojo es TU trabajo, NUNCA una pregunta al humano ni un fin de turno. ` +
            `Errores de TU config/copy/custom no tienen tope de reintentos; el tope de 2 aplica SOLO a errores de tipos que apunten al MOTOR (realinea tu config al schema, no edites motor).`,
        })
      }
    }

    return finish({
      ok: true,
      hint: "Escalera verde (validate-config + typecheck + build). Sigue a run_visual_qa (paso 9). Si editas algo después, re-llama build_check antes del push final.",
    })
  },
})
