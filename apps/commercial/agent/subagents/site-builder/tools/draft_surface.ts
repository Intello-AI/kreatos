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
- OJO: el ARCHIVO BASE es el DEMO de un cliente FICTICIO (un despacho contable). De él conserva ÚNICAMENTE el namespace "common" con TODAS sus keys (skipToContent, openMenu, closeMenu, themeToggle, whatsappLabel, whatsappMessage, googleRating, googleReviews, viewOnGoogle...), adaptando los valores al negocio real. TODO lo demás (hero, navbar, services, about, pages...) sale EXCLUSIVAMENTE del CONTENIDO A MATERIALIZAR: cualquier namespace o texto del base que el contenido no mencione se ELIMINA — dejar copy del despacho ficticio en el sitio de otro negocio es el peor defecto posible.
- Español mexicano; escapa comillas dobles dentro de strings.`,
  "site-config": `El archivo es site.config.ts del template de kreatos.
- TypeScript válido que respeta EXACTAMENTE la estructura del archivo base actual (imports, tipo del export, forma de las secciones).
- Solo cambia los valores que el spec dicta; no inventes campos nuevos ni borres los requeridos.
- Los campos REQUERIDOS del archivo base (address, geo, phone, hours, maps, social, seo, design, sections) SIEMPRE presentes — si el contenido no da un valor, conserva la forma del base con el valor que el contenido indique como mock.
- SOLO los campos opcionales (founded, whatsapp, email, icon, logo...) se omiten sin dato real (nunca strings vacíos ni ceros de relleno).`,
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
    const demoSignal = [
      "lópez y asociados",
      "lopez y asociados",
      "ricardo lópez",
      "despacho contable",
      "buzón tributario",
    ].find((signal) => content.toLowerCase().includes(signal))
    if (demoSignal) {
      return `la salida aún contiene copy del DEMO ficticio ("${demoSignal}") — todo namespace fuera de common debe salir del contenido a materializar, jamás del archivo base`
    }
  }
  if (surface === "site-config" || surface === "fonts") {
    if (!/export\s/.test(content)) {
      return "el TypeScript no tiene ningún export"
    }
    // El contrato del template: el config importa el tipo del motor. Un
    // helper inventado (defineSiteConfig etc.) rompe el build de tipos.
    if (surface === "site-config" && !content.includes('from "@/lib/config"')) {
      return 'site.config.ts debe seguir el contrato del template: `import type { SiteConfig } from "@/lib/config"` + `const config: SiteConfig = {...}` + export default — sin helpers inventados'
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
    // El spec NO es el config: el schema del template (lib/config.ts) exige
    // estos campos SIEMPRE. Rechazar aquí el contenido incompleto ahorra el
    // whack-a-mole de errores de tipos build por build.
    if (surface === "site-config") {
      const required = [
        "address",
        "geo",
        "phone",
        "hours",
        "maps",
        "social",
        "seo",
        "design",
        "sections",
      ]
      const missing = required.filter(
        (key) => !new RegExp(`\\b${key}\\s*:`).test(content),
      )
      if (missing.length > 0) {
        throw new Error(
          `Tu contenido no trae campos REQUERIDOS del schema del template: ${missing.join(", ")}. ` +
            "El spec no es el config — lee site/lib/config.ts y manda el objeto COMPLETO " +
            "(business con address/geo/phone/hours/maps/social, seo, design del template " +
            "(preset/fontPair/defaultMode/density/imageTreatment/motion — SIN concept ni " +
            "variation_notes: esos viven solo en el spec), sections). Datos de contacto sin " +
            'valor real → mock local marcado "// MOCK" (política de demo), nunca campos ausentes.',
        )
      }
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
    let problem = await validate(surface, result)
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
      hint: "Verifica con `pnpm validate-config`/`pnpm build` como siempre; si algo salió mal, corrige el archivo directamente en vez de re-transcribir.",
    }
  },
})
