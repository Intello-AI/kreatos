import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

/**
 * Genera messages/<locale>.json traduciendo el copy del locale de referencia
 * (por defecto es.json) a otro idioma, MANTENIENDO las keys idénticas. Para
 * sitios multilenguaje (config.locales con 2+): cada locale necesita su archivo
 * con las MISMAS keys que el default o el build truena con MISSING_MESSAGE.
 * Traduce con un modelo barato (gpt-5-mini) y verifica la paridad de keys.
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

export default defineTool({
  description:
    "Genera messages/<targetLocale>.json traduciendo el copy del locale de referencia (default es.json) a otro idioma, con las MISMAS keys. Úsalo en sitios multilenguaje (config.locales con 2+ idiomas): un locale sin su archivo o con keys desalineadas truena el build. Verifica la paridad de keys y reintenta si falla.",
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

    const attempt = async (model: string): Promise<string | null> => {
      const { text } = await generateText({
        model: openai(model),
        messages: [
          {
            role: "user",
            content: `${PROMPT(targetLanguageName)}\n\n${sourceRaw}`,
          },
        ],
      })
      const out = stripFences(text)
      let parsed: unknown
      try {
        parsed = JSON.parse(out)
      } catch {
        return null
      }
      const paths = leafPaths(parsed)
      // Paridad de keys: mismas hojas que el source.
      if (paths.size !== sourcePaths.size) return null
      for (const p of sourcePaths) if (!paths.has(p)) return null
      return JSON.stringify(parsed, null, 2)
    }

    const result = (await attempt("gpt-5-mini")) ?? (await attempt("gpt-5.1"))
    if (!result) {
      throw new Error(
        `La traducción a ${targetLanguageName} no conservó las keys de ${sourceLocale}.json tras 2 intentos. Revisa el es.json (¿keys raras?) o escribe messages/${targetLocale}.json a mano con las mismas keys.`,
      )
    }

    const payload = Buffer.from(result).toString("base64")
    await sandbox.run({
      command: `echo ${payload} | base64 -d > site/messages/${targetLocale}.json`,
    })

    return {
      path: `site/messages/${targetLocale}.json`,
      keys: sourcePaths.size,
      hint: `Traducido a ${targetLanguageName}. Verifica con pnpm validate-config (paridad de keys) y pnpm build.`,
    }
  },
})
