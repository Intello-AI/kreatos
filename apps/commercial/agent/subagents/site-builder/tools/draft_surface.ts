import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

/**
 * Escritor barato de superficies mecánicas: el spec ya decidió TODO y este
 * tool solo transcribe. gpt-5-nano escribe (output ~37x más barato que el
 * modelo del site-builder); si su salida no valida, reintenta una vez con
 * gpt-5-mini. Las secciones custom NO pasan por aquí: ese código es diseño
 * y lo escribe el propio site-builder.
 */

const SURFACE_RULES: Record<string, string> = {
  "es-json": `El archivo es messages/es.json de un sitio next-intl.
- Devuelve JSON VÁLIDO completo (RFC 8259): sin comentarios, sin trailing commas.
- Estructura de namespaces por sección exactamente como la pide el spec.
- El copy va LITERAL como viene en el spec — no lo parafrasees ni lo "mejores".
- Español mexicano; escapa comillas dobles dentro de strings.`,
  "site-config": `El archivo es site.config.ts del template de kreatos.
- TypeScript válido que respeta EXACTAMENTE la estructura del archivo base actual (imports, tipo del export, forma de las secciones).
- Solo cambia los valores que el spec dicta; no inventes campos nuevos ni borres los requeridos.
- Los campos opcionales sin dato real se OMITEN (nunca strings vacíos, ceros ni arrays vacíos de relleno).`,
  "theme-css": `El archivo es app/theme.css del template (tokens shadcn + Tailwind v4).
- Mantén la estructura del archivo base: :root { ... } y .dark { ... } con las MISMAS variables, más el bloque @theme inline si el base lo tiene.
- Usa EXACTAMENTE los valores de color/radius que dicta el spec — cero colores inventados.
- CSS válido, sin comentarios de proceso.`,
  fonts: `El archivo es app/fonts.ts del template (next/font).
- TypeScript válido con la MISMA forma de exports que el archivo base.
- Importa y configura exactamente las fuentes que dicta el spec (subsets, weights, variable).`,
}

function stripFences(text: string): string {
  const trimmed = text.trim()
  const match = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(trimmed)
  return match ? match[1] : trimmed
}

function validate(surface: string, content: string): string | null {
  if (!content.trim()) return "salida vacía"
  if (surface === "es-json") {
    try {
      JSON.parse(content)
    } catch (e) {
      return `JSON inválido: ${e instanceof Error ? e.message.slice(0, 200) : e}`
    }
  }
  if (
    (surface === "site-config" || surface === "fonts") &&
    !/export\s/.test(content)
  ) {
    return "el TypeScript no tiene ningún export"
  }
  if (
    surface === "theme-css" &&
    (!content.includes(":root") || !content.includes(".dark"))
  ) {
    return "el CSS no tiene los bloques :root y .dark"
  }
  return null
}

export default defineTool({
  description:
    "Escribe una superficie MECÁNICA del sitio en el sandbox (messages/es.json, site.config.ts, app/theme.css, app/fonts.ts) transcribiendo el spec con un modelo barato. Tú decides el contenido en el spec; este tool solo lo materializa. Puedes llamarlo varias veces en el mismo turno (superficies en paralelo). NUNCA lo uses para components/custom/ — ese código lo escribes tú.",
  inputSchema: z.object({
    surface: z.enum(["es-json", "site-config", "theme-css", "fonts"]),
    path: z
      .string()
      .regex(/^[\w./-]+$/)
      .describe(
        "Ruta destino relativa al repo clonado, p. ej. 'messages/es.json' o 'app/theme.css'.",
      ),
    content: z
      .string()
      .min(50)
      .describe(
        "TODO lo que el archivo debe contener, ya decidido: la porción literal del spec (copy exacto, tokens exactos, estructura de secciones/páginas). El transcriptor no decide nada — lo que no esté aquí no existirá.",
      ),
  }),
  async execute({ surface, path, content }, ctx) {
    if (path.includes("..") || path.startsWith("/")) {
      throw new Error("Ruta inválida: debe ser relativa al repo, sin '..'.")
    }
    if (path.includes("components/custom")) {
      throw new Error(
        "draft_surface no escribe secciones custom: ese código es diseño y lo escribes tú con las herramientas del sandbox.",
      )
    }
    const sandbox = await ctx.getSandbox()

    // El archivo actual del template es el contrato de estructura: el
    // transcriptor lo respeta y solo sustituye valores. null = archivo nuevo.
    const base =
      (await sandbox.readTextFile({ path: `site/${path}` })) ?? ""

    const prompt = `Eres un transcriptor de código: fiel, literal, sin creatividad.
${SURFACE_RULES[surface]}

${base ? `ARCHIVO BASE ACTUAL (respeta su estructura, sustituye valores):\n\`\`\`\n${base.slice(0, 40_000)}\n\`\`\`\n` : ""}
CONTENIDO A MATERIALIZAR (única fuente de verdad — nada fuera de esto):
${content}

Devuelve ÚNICAMENTE el contenido completo y final del archivo. Sin markdown fences, sin explicación, sin comentarios de proceso.`

    let modelUsed = "gpt-5-nano"
    let result = stripFences(
      (
        await generateText({
          model: openai("gpt-5-nano"),
          prompt,
        })
      ).text,
    )
    let problem = validate(surface, result)
    if (problem) {
      // Fallback: una pasada con mini, informándole el defecto.
      modelUsed = "gpt-5-mini"
      result = stripFences(
        (
          await generateText({
            model: openai("gpt-5-mini"),
            prompt: `${prompt}\n\nOJO: un intento anterior falló la validación por: ${problem}. Evítalo.`,
          })
        ).text,
      )
      problem = validate(surface, result)
      if (problem) {
        throw new Error(
          `La transcripción no validó ni con fallback (${problem}). Escribe este archivo tú mismo con las herramientas del sandbox.`,
        )
      }
    }

    await sandbox.writeTextFile({ path: `site/${path}`, content: result })
    return {
      path: `site/${path}`,
      bytes: result.length,
      model: modelUsed,
      hint: "Verifica con `pnpm validate-config`/`pnpm build` como siempre; si algo salió mal, corrige el archivo directamente en vez de re-transcribir.",
    }
  },
})
