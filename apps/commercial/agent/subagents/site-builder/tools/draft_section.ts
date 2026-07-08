import { generateText } from "ai"
import { defineTool, type ToolContext } from "eve/tools"
import { z } from "zod"

import { toolModel, toolModelLabel } from "../../../lib/tool-models"
import { recordToolTiming, recordToolUsage } from "../../../lib/tool-usage"

/**
 * Escribe UNA sección custom (`components/custom/<key>.tsx`) con el modelo del
 * router `codegen` (lib/tool-models — default deepseek-v4-pro), a partir del
 * ARQUETIPO + el brief de diseño que le dictas (o adaptando un componente de
 * reference/ que le pases como base). Es la Palanca 2: desacopla la escritura
 * de secciones del modelo del site-builder y del fan-out de copias.
 *
 * Por qué un tool y no el fan-out de `agent`:
 *  - El fan-out son COPIAS del site-builder → corren SU modelo. Con un modelo
 *    barato/poco obediente (qwen) una copia a veces no devuelve el archivo
 *    (task-mode roto) o improvisa. Este tool SIEMPRE deposita un .tsx válido o
 *    lanza claro — nada de huecos silenciosos.
 *  - El costo de un build vive en el bulk de secciones. Aquí ese bulk corre en
 *    el modelo del router `codegen` pase lo que pase el orquestador; el
 *    orquestador solo dicta el arquetipo y el brief (pocos tokens) → puede ser
 *    un modelo obediente barato.
 *
 * NO decide diseño de la nada: el ARQUETIPO y el contenido los fijas TÚ (con
 * taste + anti-generic cargados). El tool transcribe ese criterio a código que
 * respeta el contrato del template. draft_surface es para las 4 superficies
 * mecánicas; ESTO es para el código de diseño de cada sección.
 */

// Reglas del fan-out EMBEBIDAS verbatim (el modelo del tool NO hereda skills).
const SECTION_RULES = `REGLAS DURAS (cúmplelas TODAS, son verificables):
- El componente recibe props \`{ ns: string }\` y NADA más.
- Copy 100% vía next-intl con ese ns: \`const t = useTranslations(ns)\` (o
  getTranslations); arrays con \`t.raw("x") as Tipo[]\`. CERO texto hardcodeado
  visible (todo sale de t("...")). Labels comunes: useTranslations("common").
- Envuelve el cuerpo en <Section> de "@/components/shared/section" (hornea
  py-(--section-gap) + el contenedor max-w-6xl px-6 lg:px-8). PROHIBIDO py-16/20/24
  o max-w-* propios. Fondo/borde/id de ancla van en el className del <Section>.
  Excepción: un HERO que fija su alto con min-h usa <Section flush>.
- SOLO tokens semánticos del theme: bg-primary, text-foreground, border-border,
  bg-accent, text-muted-foreground, bg-card, bg-background, text-primary-foreground…
  CERO hex / rgb() / oklch() / bg-blue-500 en className. El acento con avaricia
  (CTAs y datos clave), NUNCA como fondo de una sección entera.
- Motion con <Reveal> de "@/components/shared/reveal" (entradas). Una sola
  coreografía sutil, no fade-in idéntico en cada hijo.
- Imágenes con <SmartImage> de "@/components/shared/smart-image": pásale
  className con el aspecto (aspect-[4/3], min-h-[85vh]…). NUNCA props fill/width/
  height (ya hace fill por dentro) ni <img> ni next/image directo.
- Server component por default. "use client" SOLO si hay estado/efectos reales
  (p. ej. el formulario con useContactForm) — y entonces es la primera línea.
- Jerarquía de headings: h2/h3 en secciones; h1 SOLO en hero o page-intro.
- Texto claro SOBRE imagen: text-primary-foreground (u overlay oscuro). Nunca
  texto oscuro ilegible sobre foto.
- Prohibido: emojis, lorem/placeholder/TODO, grid de 3 cards idénticas
  icono+título+párrafo para servicios, claims vacíos ("empresa líder"), guiones
  largos (—) o cortos (–) en el texto JSX (usa dos puntos, punto o paréntesis).
- Enlaces internos con \`Link\` de "@/i18n/navigation" (no next/link). Datos del
  negocio desde \`config\` de "@/site.config" cuando apliquen.`

const PRIMITIVES = `CONTRATOS DEL TEMPLATE (firmas EXACTAS — NO las inventes; son la causa #1 de errores de build).

IMPORTS (exactos):
- import config from "@/site.config"   ← export DEFAULT. NUNCA \`import { config }\`.
- import { Link } from "@/i18n/navigation"   ← export NOMBRADO. NUNCA \`import Link from\`. (enlaces internos)
- import { Section } from "@/components/shared/section"
- import { Reveal } from "@/components/shared/reveal"
- import { SmartImage } from "@/components/shared/smart-image"
- import { MapEmbed } from "@/components/shared/map-embed"
- import { useContactForm } from "@/components/shared/use-contact-form"
- inputs: import { Input } from "@/components/ui/input"; import { Textarea } from "@/components/ui/textarea".
  NO EXISTE "@/components/ui/field" ni FieldGroup/Field/FieldLabel — usa <label> normal.

PRIMITIVES:
- <Section className? innerClassName? bleed? flush? as?>{children}</Section> — className al <section>
  exterior (fondo/borde/id); flush = sin padding vertical (heros con min-h); bleed = el hijo controla el ancho.
- <Reveal className? delay?>{children}</Reveal> — delay en segundos para escalonar.
- <SmartImage src alt className priority? /> — className lleva el aspecto; NUNCA fill/width/height.
- <MapEmbed business={config.business} title={t("mapTitle")} className="h-full w-full" /> — requiere las 3 props.

FORMULARIO — useContactForm (API REAL, NO inventes handleSubmit/success/error):
  const form = useContactForm(\`\${ns}.form\`)
  <form onSubmit={form.onSubmit} noValidate>
    <Input {...form.register("name")} aria-invalid={Boolean(form.errors.name)} />
    {form.errors.name ? <p className="text-sm text-destructive">{form.errors.name.message}</p> : null}
  El submit YA viene envuelto: pásale form.onSubmit directo. Campos: name/phone/email/message. <button type="submit">.

SHAPE DE CONFIG (TODO cuelga de config.business):
- config.business.name / .shortName / .phone / .whatsapp (dígitos) / .email? / .category
- config.business.address.{street,colonia,city,state,zip} · config.business.hours[0].{days,open,close}
- config.business.maps.{uri,placeId,rating,reviewsCount} · config.business.social?.{facebook,linkedin,instagram}
- NO existe config.shortName (es config.business.shortName), config.contact, ni config.social como array.
- WhatsApp href: \`https://wa.me/\${config.business.whatsapp}\`.`

function stripFences(text: string): string {
  const trimmed = text.trim()
  const match = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(trimmed)
  return match ? match[1] : trimmed
}

/** Valida el .tsx generado; devuelve el problema o null. */
async function validate(
  source: string,
  opts: { isSlot: boolean; ns: string },
): Promise<string | null> {
  if (!source.trim()) return "salida vacía"
  // Export de componente en PascalCase (assemble_registry lo necesita).
  if (
    !/export\s+(?:default\s+)?function\s+[A-Z]/.test(source) &&
    !/export\s+const\s+[A-Z][A-Za-z0-9_]*\s*[:=]/.test(source)
  ) {
    return "no exporta un componente nombrado en PascalCase (export function Xxx / export const Xxx)"
  }
  // Copy vía next-intl.
  if (!/from\s+["']next-intl["']/.test(source)) {
    return "no importa next-intl — el copy DEBE salir de useTranslations(ns), nada hardcodeado"
  }
  // Tokens: sin hex de color ni rgb()/oklch() en el archivo.
  const hex = source.match(/#[0-9a-fA-F]{3,8}\b/)
  if (hex) return `color literal ${hex[0]} — usa SOLO tokens semánticos del theme`
  if (/\b(?:rgb|rgba|hsl|oklch)\(/.test(source)) {
    return "color literal rgb/hsl/oklch — usa SOLO tokens semánticos del theme"
  }
  // Sin guiones largos/cortos.
  if (/[—–]/.test(source)) return "contiene guion largo (—) o corto (–): reemplázalo"
  // <Section> salvo header/footer (que emite contenido interior del slot).
  if (!opts.isSlot && !/<Section[\s>]/.test(source)) {
    return "no envuelve el cuerpo en <Section> (ritmo/contenedor del template)"
  }
  // SmartImage mal usado.
  if (/<SmartImage[^>]*\b(?:fill|width|height)=/.test(source)) {
    return "SmartImage con prop fill/width/height (ya hace fill por dentro): pásale solo className con el aspecto"
  }
  // Contratos del template que los modelos baratos fallan seguido (caza al
  // draft, no en build → ahorra ciclos de build-repair).
  if (/import\s*\{\s*config\s*\}\s*from\s*["']@\/site\.config["']/.test(source)) {
    return 'config es export DEFAULT: usa `import config from "@/site.config"`, no `import { config }`'
  }
  if (/@\/components\/ui\/field\b/.test(source)) {
    return "no existe @/components/ui/field (ni FieldGroup/Field/FieldLabel): usa <label> normal + Input/Textarea de @/components/ui/*"
  }
  if (/import\s+Link\s+from\s*["']@\/i18n\/navigation["']/.test(source)) {
    return 'Link es export NOMBRADO: usa `import { Link } from "@/i18n/navigation"`'
  }
  if (/\bform\.(handleSubmit|success|error)\b/.test(source)) {
    return "API de useContactForm: `<form onSubmit={form.onSubmit}>` y errores en `form.errors.<campo>.message`; NO existen form.handleSubmit / form.success / form.error"
  }
  if (/\bconfig\.(shortName|contact|social)\b/.test(source)) {
    return "shape de config incorrecto: los datos cuelgan de config.business (config.business.shortName, .phone, .social…), NO de config directo"
  }
  // Sintaxis TS/TSX real (atrapa roto aquí, no en el build).
  try {
    const ts = await import("typescript")
    const { diagnostics } = ts.transpileModule(source, {
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
      return `error de sintaxis TSX: ${ts
        .flattenDiagnosticMessageText(syntaxError.messageText, " ")
        .slice(0, 200)}`
    }
  } catch {
    // typescript no disponible: lo cazará build_check
  }
  return null
}

export default defineTool({
  description:
    "Escribe UNA sección custom (components/custom/<key>.tsx) con un modelo de coding dedicado a partir del ARQUETIPO y el brief de diseño que le dictas — o ADAPTA un componente de reference/ que le pases como BASE en el brief. Úsalo en el paso 7 para materializar cada sección en vez del fan-out de `agent` (que corre el modelo del site-builder y a veces no devuelve el archivo): este tool SIEMPRE deposita un .tsx válido o lanza claro. TÚ decides diseño (arquetipo + layout + qué contenido, con taste/anti-generic cargados); el tool lo transcribe respetando el contrato del template (Section, tokens semánticos, Reveal, SmartImage, next-intl). Llama uno por sección (puedes emitir varias llamadas en el mismo turno). Después ensambla con assemble_registry. NO es para las 4 superficies mecánicas (usa draft_surface) ni para parches puntuales (usa edit_file).",
  inputSchema: z.object({
    path: z
      .string()
      .regex(/^[\w./-]+$/)
      .describe(
        "Ruta de la custom, p. ej. 'components/custom/hero-expediente.tsx' (kebab-case, por FUNCIÓN, sin nombre del cliente).",
      ),
    component: z
      .string()
      .regex(/^[A-Z][A-Za-z0-9_]*$/)
      .describe(
        "Nombre del componente exportado en PascalCase, p. ej. 'HeroExpediente'. Debe casar con el archivo.",
      ),
    ns: z
      .string()
      .describe(
        "Namespace de next-intl de esta sección (igual que en site.config.ts), p. ej. 'hero-expediente' o 'pages.servicios.grupos'.",
      ),
    archetype: z
      .string()
      .describe(
        "Arquetipo estructural: hero (masthead/split/foto-a-sangre/stat-led), stat-wall, services-ledger, feature-zigzag, bento/mosaico, timeline, band-fullbleed, contacto-split… Uno, y dilo explícito.",
      ),
    brief: z
      .string()
      .min(40)
      .describe(
        "El diseño CONCRETO de ESTA sección: layout exacto, qué muestra cada parte, qué keys de copy usa del ns (t('title'), t.raw('items')…), qué imágenes (rutas en /images/…) y su encuadre, jerarquía, gestos. Cuanto más concreto, mejor sale. El tool no inventa contenido: lo que no esté aquí no existe. Si ADAPTAS un arquetipo de reference/, pega su código aquí como 'BASE A ADAPTAR:' y di qué cambiar (marca, copy/ns, contenido, estructura) — el tool parte de él, no de cero (adaptar ≠ pegar verbatim).",
      ),
    isSlot: z
      .boolean()
      .optional()
      .describe(
        "true para header/footer (slot): emiten el contenido INTERIOR, el motor los envuelve en <header>/<footer> y NO usan <Section>. Por defecto false.",
      ),
    useClient: z
      .boolean()
      .optional()
      .describe(
        'true si la sección necesita "use client" (estado real: menú móvil, useContactForm). Por defecto server component.',
      ),
  }),
  async execute(input, ctx) {
    return draftOneSection(input, ctx)
  },
})

export interface DraftSectionInput {
  path: string
  component: string
  ns: string
  archetype: string
  brief: string
  isSlot?: boolean
  useClient?: boolean
}

/**
 * Core reutilizable: dibuja UNA sección custom. Lo usan draft_section (single)
 * y draft_sections (plural, en paralelo). Normaliza la ruta, arma el prompt,
 * llama al modelo del router `codegen`, valida (con reintento) y escribe al
 * sandbox. Lanza claro si no valida ni con reintento.
 */
export async function draftOneSection(
  { path, component, ns, archetype, brief, isSlot, useClient }: DraftSectionInput,
  ctx: ToolContext,
) {
    for (const rootPrefix of ["/workspace/site/", "/workspace/", "site/"]) {
      if (path.startsWith(rootPrefix)) {
        path = path.slice(rootPrefix.length)
        break
      }
    }
    if (path.includes("..") || path.startsWith("/")) {
      throw new Error("Ruta inválida: debe caer bajo /workspace/site, sin '..'.")
    }
    if (!path.includes("components/custom")) {
      throw new Error(
        "draft_section solo escribe en components/custom/. Para las superficies mecánicas usa draft_surface.",
      )
    }

    const prompt = `Eres un ingeniero de front-end senior escribiendo UNA sección de un sitio Next.js (App Router, RSC, Tailwind v4, shadcn) hecho a la medida de una agencia. Materializas el criterio de diseño que se te dicta — sin improvisar contenido ni layout genérico.

${SECTION_RULES}

${PRIMITIVES}

ARCHIVO A ESCRIBIR: components/custom/${path.split("/").pop()}
- Export: ${useClient ? '"use client" en la PRIMERA línea, luego ' : ""}\`export function ${component}({ ns }: { ns: string })\`.
- Namespace de copy (ns): "${ns}".
- Arquetipo estructural: ${archetype}.
${isSlot ? "- Es SLOT (header/footer): emite el contenido INTERIOR, NO uses <Section> ni <header>/<footer> (los pone el motor)." : ""}

BRIEF DE DISEÑO DE ESTA SECCIÓN (única fuente del contenido y el layout):
${brief}

Si el brief incluye un "COMPONENTE BASE" / "BASE A ADAPTAR", PARTE de él y adáptalo (no reescribas de cero): conserva lo que sirva y cambia marca, copy (a t()/ns), contenido y estructura para ESTE sitio, divergiendo lo suficiente (nunca un verbatim). En cualquier caso cumple TODAS las REGLAS DURAS.

Devuelve ÚNICAMENTE el contenido completo y final del archivo .tsx. Sin markdown fences, sin explicación, sin comentarios de proceso.`

    // Codegen por tarea (router central): default deepseek-v4-pro (coding fuerte
    // a ~1/7 del input de Sonnet → menos costo por sección; el gate visual
    // review_screenshots SIGUE en Sonnet y caza la sección fea). A/B por env
    // TOOL_MODEL_CODEGEN (p. ej. anthropic:claude-sonnet-5 para volver) — es
    // single-shot + validado abajo, así que un modelo barato ahí no arrastra la
    // debilidad de adherencia.
    const model = toolModel("codegen")
    const modelUsed = toolModelLabel("codegen")
    // Instrumentación (Fase 0): latencia por sección → decide si vale
    // paralelizar (draft_sections plural). retried marca si hubo 2º generateText.
    const t0 = Date.now()
    let retried = false
    const first = await generateText({ model, prompt })
    await recordToolUsage(ctx, "site-builder", modelUsed, first.usage)
    let result = stripFences(first.text)
    let problem = await validate(result, { isSlot: !!isSlot, ns })
    if (problem) {
      retried = true
      // Reintento informándole el defecto (mismo modelo: es capaz, solo resbaló).
      const retry = await generateText({
        model,
        prompt: `${prompt}\n\nOJO: un intento anterior falló la validación por: ${problem}. Corrígelo sin romper lo demás.`,
      })
      await recordToolUsage(ctx, "site-builder", modelUsed, retry.usage)
      result = stripFences(retry.text)
      problem = await validate(result, { isSlot: !!isSlot, ns })
      if (problem) {
        throw new Error(
          `La sección generada no validó ni con reintento (${problem}). Escríbela tú directo con las herramientas del sandbox (write_file) aplicando taste + anti-generic.`,
        )
      }
    }

    const sandbox = await ctx.getSandbox()
    await sandbox.writeTextFile({ path: `site/${path}`, content: result })
    void recordToolTiming(ctx, "site-builder", "draft_section", Date.now() - t0, {
      ok: true,
      meta: { archetype, model: modelUsed, retried, bytes: result.length, isSlot: !!isSlot },
    })
    return {
      path: `site/${path}`,
      component,
      ns,
      bytes: result.length,
      model: modelUsed,
      hint: "Sección escrita y validada (sintaxis, tokens, next-intl). Cuando tengas todas, corre assemble_registry (determinista) y luego build_check. Correcciones puntuales tras QA/build: edit_file, no re-generes la sección entera.",
    }
}
