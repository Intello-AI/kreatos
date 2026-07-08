import { openai } from "@ai-sdk/openai"
import { generateText, type LanguageModel } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { toolModel, toolModelLabel } from "../../../lib/tool-models"
import { recordToolUsage } from "../../../lib/tool-usage"

/**
 * Genera messages/<locale>.json traduciendo el copy del locale de referencia
 * (por defecto es.json) a otro idioma, MANTENIENDO las keys idénticas. Para
 * sitios multilenguaje (config.locales con 2+): cada locale necesita su archivo
 * con las MISMAS keys que el default o el build truena con MISSING_MESSAGE.
 *
 * INCREMENTAL: guarda un snapshot del source usado en la última traducción
 * (site/.agent/, tooling del sandbox — nunca entra al repo). En re-runs solo
 * traduce las hojas NUEVAS o cuyo valor source CAMBIÓ y reusa el resto; las
 * huérfanas caen solas porque el target se reconstruye espejando el source.
 * Medido en prod (Sixcal v2): 4 translate_copy COMPLETOS por rondas de repair
 * de es.json = ~14 min de wall-clock; incremental corta cada re-run a segundos.
 * La paridad de keys queda garantizada POR CONSTRUCCIÓN (el target se arma
 * recorriendo la estructura del source), no solo verificada.
 */

/** Rutas de las hojas string, para comparar que dos jsons tengan las mismas keys. */
function leafPaths(value: unknown, path = "", out = new Set<string>()): Set<string> {
  if (typeof value === "string") out.add(path)
  else if (Array.isArray(value))
    value.forEach((v, i) => leafPaths(v, `${path}[${i}]`, out))
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value))
      leafPaths(v, path ? `${path}.${k}` : k, out)
  return out
}

/** Mapa path→string de todas las hojas (mismas rutas que leafPaths). */
function leafMap(
  value: unknown,
  path = "",
  out = new Map<string, string>(),
): Map<string, string> {
  if (typeof value === "string") out.set(path, value)
  else if (Array.isArray(value))
    value.forEach((v, i) => leafMap(v, `${path}[${i}]`, out))
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value))
      leafMap(v, path ? `${path}.${k}` : k, out)
  return out
}

/**
 * Reconstruye el JSON con la MISMA estructura del source, tomando cada hoja de
 * `pick(path, sourceValue)`. Paridad de keys por construcción.
 */
function rebuild(
  value: unknown,
  pick: (path: string, sourceValue: string) => string,
  path = "",
): unknown {
  if (typeof value === "string") return pick(path, value)
  if (Array.isArray(value))
    return value.map((v, i) => rebuild(v, pick, `${path}[${i}]`))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value))
      out[k] = rebuild(v, pick, path ? `${path}.${k}` : k)
    return out
  }
  return value
}

function stripFences(text: string): string {
  const t = text.trim()
  const m = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(t)
  return m ? m[1] : t
}

const PROMPT = (langName: string) =>
  `Traduce al ${langName} TODOS los valores string de este JSON de copy web, MANTENIENDO:
- La estructura y las KEYS EXACTAMENTE iguales (no agregues, no quites, no renombres).
- Los placeholders de next-intl intactos: {rating}, {count}, etc.
- Sin traducir: nombres propios/marca, correos, teléfonos, URLs, rutas (/servicios, #contacto), y valores que claramente sean identificadores (href).
- Tono natural y profesional en ${langName}, no traducción literal robótica.
Devuelve SOLO el JSON válido traducido (sin markdown, sin comentarios).`

async function writeJson(
  sandbox: { run(input: { command: string }): PromiseLike<unknown> },
  path: string,
  content: string,
): Promise<void> {
  const payload = Buffer.from(content).toString("base64")
  await sandbox.run({
    command: `mkdir -p $(dirname ${path}) && echo ${payload} | base64 -d > ${path}`,
  })
}

export default defineTool({
  description:
    "Genera messages/<targetLocale>.json traduciendo el copy del locale de referencia (default es.json) a otro idioma, con las MISMAS keys. Úsalo en sitios multilenguaje (config.locales con 2+ idiomas): un locale sin su archivo o con keys desalineadas truena el build. Es INCREMENTAL: en re-runs traduce solo las keys nuevas/cambiadas del source y reusa el resto — re-llamarlo tras parchar es.json es barato. Verifica la paridad de keys y reintenta si falla.",
  inputSchema: z.object({
    targetLocale: z
      .string()
      .min(2)
      .describe('Código del locale destino, p. ej. "en", "fr".'),
    targetLanguageName: z
      .string()
      .min(3)
      .describe('Nombre del idioma en español para el prompt, p. ej. "inglés".'),
    sourceLocale: z
      .string()
      .min(2)
      .default("es")
      .describe("Locale de referencia a traducir (default es)."),
  }),
  async execute({ targetLocale, targetLanguageName, sourceLocale }, ctx) {
    const sandbox = await ctx.getSandbox()
    const sourceRaw = await sandbox.readTextFile({
      path: `site/messages/${sourceLocale}.json`,
    })
    if (!sourceRaw) {
      throw new Error(
        `No existe site/messages/${sourceLocale}.json — materializa el copy del locale de referencia antes de traducir.`,
      )
    }
    let sourceJson: unknown
    try {
      sourceJson = JSON.parse(sourceRaw)
    } catch (e) {
      throw new Error(
        `site/messages/${sourceLocale}.json no es JSON válido: ${e instanceof Error ? e.message : e}`,
      )
    }
    const sourcePaths = leafPaths(sourceJson)
    const sourceLeaves = leafMap(sourceJson)

    // ── Incremental: ¿qué hojas ya están traducidas con el MISMO source? ──
    // Snapshot del source usado en la última corrida (en .agent/: tooling del
    // sandbox, excluido del repo) + target existente. Una hoja se REUSA si su
    // valor source no cambió desde esa corrida y el target la tiene.
    const snapshotPath = `site/.agent/translate-src-${targetLocale}.json`
    const targetPath = `site/messages/${targetLocale}.json`
    const reusable = new Map<string, string>()
    const [snapshotRaw, targetRaw] = await Promise.all([
      sandbox.readTextFile({ path: snapshotPath }),
      sandbox.readTextFile({ path: targetPath }),
    ])
    if (snapshotRaw && targetRaw) {
      try {
        const prevSource = leafMap(JSON.parse(snapshotRaw))
        const prevTarget = leafMap(JSON.parse(targetRaw))
        for (const [path, value] of sourceLeaves) {
          const translated = prevTarget.get(path)
          if (translated !== undefined && prevSource.get(path) === value) {
            reusable.set(path, translated)
          }
        }
      } catch {
        // snapshot/target corruptos → traducción completa (reusable vacío)
      }
    }
    const pending = [...sourceLeaves].filter(([path]) => !reusable.has(path))

    // Nada nuevo que traducir: reconstruye el target espejando el source (así
    // caen huérfanas y se respeta el orden) y termina sin tocar el modelo.
    if (pending.length === 0) {
      const merged = rebuild(sourceJson, (path) => reusable.get(path) ?? "")
      await writeJson(sandbox, targetPath, JSON.stringify(merged, null, 2))
      await writeJson(sandbox, snapshotPath, sourceRaw)
      return {
        path: targetPath,
        keys: sourcePaths.size,
        translated: 0,
        reused: reusable.size,
        hint: `Sin keys nuevas: ${targetLocale}.json reconstruido reusando la traducción previa (0 llamadas al modelo). Verifica con pnpm validate-config.`,
      }
    }

    // Payload a traducir: SOLO las hojas pendientes, como objeto plano
    // {path: valor} — el modelo devuelve el mismo objeto traducido.
    const pendingObj = Object.fromEntries(pending)
    const pendingJson = JSON.stringify(pendingObj, null, 2)
    const fullRun = reusable.size === 0

    const attempt = async (
      model: LanguageModel,
      label: string,
    ): Promise<Map<string, string> | null> => {
      const res = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: `${PROMPT(targetLanguageName)}\n\n${pendingJson}`,
          },
        ],
      })
      await recordToolUsage(ctx, "site-builder", label, res.usage)
      const out = stripFences(res.text)
      let parsed: unknown
      try {
        parsed = JSON.parse(out)
      } catch {
        return null
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
      const entries = new Map<string, string>()
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v !== "string") return null
        entries.set(k, v)
      }
      // Paridad: exactamente las mismas keys pendientes.
      if (entries.size !== pending.length) return null
      for (const [path] of pending) if (!entries.has(path)) return null
      return entries
    }

    // Traducción barata (router central): default del router; fallback
    // gpt-5-mini si el primero no conserva la paridad de keys del JSON.
    const translated =
      (await attempt(toolModel("translate"), toolModelLabel("translate"))) ??
      (await attempt(openai("gpt-5-mini"), "gpt-5-mini"))
    if (!translated) {
      throw new Error(
        `La traducción a ${targetLanguageName} no conservó las keys de ${sourceLocale}.json tras 2 intentos. Revisa el es.json (¿keys raras?) o escribe messages/${targetLocale}.json a mano con las mismas keys.`,
      )
    }

    // Merge por construcción: estructura del source, hoja a hoja.
    const merged = rebuild(
      sourceJson,
      (path, sourceValue) =>
        translated.get(path) ?? reusable.get(path) ?? sourceValue,
    )
    await writeJson(sandbox, targetPath, JSON.stringify(merged, null, 2))
    await writeJson(sandbox, snapshotPath, sourceRaw)

    return {
      path: targetPath,
      keys: sourcePaths.size,
      translated: translated.size,
      reused: reusable.size,
      hint: `Traducido a ${targetLanguageName}${fullRun ? "" : ` (incremental: ${translated.size} key(s) nuevas, ${reusable.size} reusadas)`}. Verifica con pnpm validate-config (paridad de keys) y pnpm build.`,
    }
  },
})
