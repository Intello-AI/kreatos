import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { recordToolUsage } from "../../../lib/tool-usage"

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
- OJO: el ARCHIVO BASE es el DEMO de un cliente FICTICIO (un despacho contable). De él conserva ÚNICAMENTE el namespace "common" con TODAS sus keys (skipToContent, openMenu, closeMenu, themeToggle, whatsappLabel, whatsappMessage, googleRating, googleReviews, viewOnGoogle...), adaptando los valores al negocio real. TODO lo demás (hero, navbar, services, about, pages...) sale EXCLUSIVAMENTE del CONTENIDO A MATERIALIZAR: cualquier namespace o texto del base que el contenido no mencione se ELIMINA — dejar copy del despacho ficticio en el sitio de otro negocio es el peor defecto posible.
- Español mexicano; escapa comillas dobles dentro de strings.`,
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

async function validate(
  surface: string,
  content: string,
): Promise<string | null> {
  if (!content.trim()) return "salida vacía"
  if (surface === "es-json") {
    try {
      JSON.parse(content)
    } catch (e) {
      return `JSON inválido: ${e instanceof Error ? e.message.slice(0, 200) : e}`
    }
    // El demo contable NUNCA sobrevive en el sitio de un cliente real.
    // Solo firmas ÚNICAS del demo (nombre + fundador ficticio). NUNCA términos
    // del giro: un cliente contable legítimo dice "despacho contable" y "buzón
    // tributario" — banearlos rechazaba el regen correcto y forzaba a escribir
    // es.json a mano (la raíz del sufrimiento en el run de Invoice Laguna).
    const demoSignal = [
      "lópez y asociados",
      "lopez y asociados",
      "ricardo lópez",
    ].find((signal) => content.toLowerCase().includes(signal))
    if (demoSignal) {
      return `la salida aún contiene copy del DEMO ficticio ("${demoSignal}") — todo namespace fuera de common debe salir del contenido a materializar, jamás del archivo base`
    }
  }
  if (surface === "fonts") {
    if (!/export\s/.test(content)) {
      return "el TypeScript no tiene ningún export"
    }
    // Chequeo sintáctico real: atrapa TS roto aquí en vez de esperar al
    // `pnpm build` del sandbox (feedback mucho más tardío). Si typescript
    // no está disponible en el runtime, se omite sin fallar.
    try {
      const ts = await import("typescript")
      const { diagnostics } = ts.transpileModule(content, {
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
        },
      })
      const syntaxError = diagnostics?.find(
        (d) => d.category === ts.DiagnosticCategory.Error,
      )
      if (syntaxError) {
        const message = ts.flattenDiagnosticMessageText(
          syntaxError.messageText,
          " ",
        )
        return `TypeScript con error de sintaxis: ${message.slice(0, 200)}`
      }
    } catch {
      // typescript no disponible en este runtime: lo validará pnpm build
    }
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
    "Escribe una superficie MECÁNICA del sitio en el sandbox SIN el guard read-before-write (escribe por shell). Cuatro superficies: 'es-json' y 'site-config' se escriben PASS-THROUGH (verbatim, sin modelo) — les pasas el archivo COMPLETO ya armado por ti (el es.json entero con TODOS los namespaces incluido 'common'; el objeto SiteConfig completo) y el tool solo lo deposita; 'theme-css'/'fonts' se TRANSCRIBEN con un modelo barato (dale los valores finales). Úsalo para las 4 superficies del template en vez de write_file (que exige read_file primero). Puedes llamarlo varias veces en el mismo turno. NUNCA para components/custom/ — ese código lo escribes tú.",
  inputSchema: z.object({
    surface: z.enum(["es-json", "theme-css", "fonts", "site-config"]),
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

    // PASS-THROUGH (sin modelo): superficies que el agente compone COMPLETAS.
    // El transcriptor barato solo agregaba riesgo — con es.json re-metía las
    // keys del DEMO base y renombraba los namespaces del contenido (causó 17
    // errores de espejo en el run de LEDIV: config apuntaba a home-hero/
    // navbar-main y el es.json quedó con hero/navbar del demo). Como el agente
    // ya arma el JSON/objeto completo, se escribe VERBATIM.
    if (surface === "site-config" || surface === "es-json") {
      if (surface === "site-config") {
        if (
          !content.includes("SiteConfig") ||
          !content.includes("export default config")
        ) {
          throw new Error(
            'site-config pass-through: el content debe ser el archivo completo — `import type { SiteConfig } from "@/lib/config"` + `const config: SiteConfig = {…}` + `export default config`.',
          )
        }
      } else {
        // es-json: JSON válido + tiene "common" (el motor lo exige) + sin demo.
        let parsed: unknown
        try {
          parsed = JSON.parse(content)
        } catch (e) {
          throw new Error(
            `es-json pass-through: JSON inválido — ${e instanceof Error ? e.message.slice(0, 200) : e}. Pásame el messages/es.json COMPLETO y bien formado (el objeto entero, tú lo compusiste).`,
          )
        }
        if (
          !parsed ||
          typeof parsed !== "object" ||
          !("common" in (parsed as Record<string, unknown>))
        ) {
          throw new Error(
            'es-json pass-through: falta el namespace "common" (el motor lo necesita: skipToContent, openMenu, whatsappLabel, googleRating…). Inclúyelo COMPLETO en tu content, con TODOS los namespaces del sitio.',
          )
        }
        const demo = ["lópez y asociados", "lopez y asociados", "ricardo lópez"].find(
          (s) => content.toLowerCase().includes(s),
        )
        if (demo) {
          throw new Error(
            `es-json pass-through: aún contiene copy del DEMO ficticio ("${demo}"). El es.json NACE de tu contenido, jamás del archivo base — recompón el JSON con el copy real del cliente.`,
          )
        }
      }
      await sandbox.writeTextFile({ path: `site/${path}`, content })
      return {
        path: `site/${path}`,
        bytes: content.length,
        model: "pass-through",
        hint: "Escrito verbatim (sin guard). Verifica con `pnpm validate-config`/`pnpm build`; si falla un valor puntual, corrígelo con `edit_file` (diff, barato) — solo vuelve a llamar draft_surface si hay que recomponer la superficie completa. NO uses write_file sobre esta superficie (ya existe → dispara el guard).",
      }
    }

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
    const nano = await generateText({
      model: openai("gpt-5-nano"),
      prompt,
    })
    await recordToolUsage(ctx, "site-builder", "gpt-5-nano", nano.usage)
    let result = stripFences(nano.text)
    let problem = await validate(surface, result)
    if (problem) {
      // Fallback: una pasada con mini, informándole el defecto.
      modelUsed = "gpt-5-mini"
      const mini = await generateText({
        model: openai("gpt-5-mini"),
        prompt: `${prompt}\n\nOJO: un intento anterior falló la validación por: ${problem}. Evítalo.`,
      })
      await recordToolUsage(ctx, "site-builder", "gpt-5-mini", mini.usage)
      result = stripFences(mini.text)
      problem = await validate(surface, result)
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
      hint: "Verifica con `pnpm validate-config`/`pnpm build`; si un valor puntual salió mal, corrígelo con `edit_file` (diff, un paso barato) — solo vuelve a llamar draft_surface si hay que recomponer la superficie completa. NO uses write_file sobre esta superficie (ya existe → dispara el guard read-before-write).",
    }
  },
})
