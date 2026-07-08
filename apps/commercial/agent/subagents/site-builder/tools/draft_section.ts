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

/* ── Retrieval de referencias (la práctica v0/Lovable) ─────────────────────
 * El defecto medido de "genérico y corto": el modelo de codegen escribía cada
 * sección DESDE CERO a partir de un brief de prosa — los ~530 bloques de
 * reference/blocks (código real, denso, probado) solo llegaban si el
 * orquestador pegaba uno a mano en el brief (en prod: nunca). Aquí el tool
 * recupera SOLO el bloque más afín al arquetipo (matching léxico sobre los
 * nombres descriptivos kebab-case, con puente es→en) y lo inyecta como BASE A
 * ADAPTAR. El modelo parte de estructura rica en vez de inventar layout plano.
 */

const referenceIndexCache = new Map<string, string[]>()

async function listReferenceBlocks(sandbox: {
  id: string
  run(input: { command: string }): PromiseLike<{ stdout: string }>
}): Promise<string[]> {
  const cached = referenceIndexCache.get(sandbox.id)
  if (cached) return cached
  const res = await sandbox.run({
    command: `ls site/reference/blocks/ 2>/dev/null || true`,
  })
  const files = res.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((f) => f.endsWith(".tsx"))
  referenceIndexCache.set(sandbox.id, files)
  return files
}

/** Puente léxico es→en: los briefs vienen en español, los archivos en inglés. */
const SYNONYMS: Record<string, string[]> = {
  servicio: ["services", "service"],
  servicios: ["services", "service"],
  precio: ["pricing", "price"],
  precios: ["pricing", "plans"],
  tarifas: ["pricing", "plans"],
  planes: ["pricing", "plans"],
  preguntas: ["faq"],
  frecuentes: ["faq"],
  acordeon: ["accordion", "faq"],
  contacto: ["contact"],
  formulario: ["contact", "form"],
  equipo: ["team"],
  nosotros: ["about"],
  historia: ["about", "story", "timeline"],
  valores: ["values", "about"],
  proceso: ["process", "steps", "timeline"],
  pasos: ["steps", "process", "timeline"],
  alta: ["onboarding", "process", "steps"],
  mosaico: ["bento", "mosaic", "masonry"],
  bento: ["bento", "masonry"],
  asimetrico: ["asymmetric", "bento"],
  asimetrica: ["asymmetric", "bento"],
  celdas: ["cell", "bento"],
  foto: ["image", "photo"],
  fotos: ["image", "photo", "gallery"],
  imagen: ["image", "photo"],
  sangre: ["fullbleed", "bleed"],
  bleed: ["fullbleed"],
  scrim: ["overlay", "dark"],
  overlay: ["overlay"],
  galeria: ["gallery"],
  resenas: ["testimonials", "reviews"],
  testimonios: ["testimonials"],
  opiniones: ["testimonials", "reviews"],
  cifras: ["stats", "metrics", "numbers"],
  indicadores: ["stats", "metrics", "kpi"],
  datos: ["stats", "metrics"],
  estadisticas: ["stats", "metrics"],
  kpi: ["stats", "metrics", "kpi"],
  kpis: ["stats", "metrics", "kpi"],
  banda: ["band", "banner", "cta"],
  franja: ["band", "banner", "strip"],
  zigzag: ["zigzag", "alternating", "feature"],
  alterno: ["alternating", "zigzag"],
  tablero: ["board", "sticky", "panel", "index"],
  portada: ["hero"],
  cabecera: ["header", "nav"],
  menu: ["menu", "nav", "header"],
  pie: ["footer"],
  mapa: ["map", "contact"],
  oscuro: ["dark"],
  claro: ["light"],
  ledger: ["ledger", "table", "list"],
  tabla: ["table", "ledger", "list"],
  lista: ["list"],
  editorial: ["editorial", "prose", "narrative"],
  prosa: ["prose", "narrative", "editorial"],
  triada: ["three", "trio", "columns"],
  columnas: ["columns"],
  diagonal: ["diagonal"],
  destacado: ["featured", "spotlight"],
  logros: ["milestones", "awards"],
  hito: ["milestone"],
  hitos: ["milestones", "timeline"],
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

function expand(tokens: string[]): Set<string> {
  const out = new Set<string>()
  for (const t of tokens) {
    out.add(t)
    for (const syn of SYNONYMS[t] ?? []) out.add(syn)
  }
  return out
}

/**
 * Selecciona el bloque de reference/blocks más afín. El arquetipo pesa más que
 * el brief (define la ESTRUCTURA); el token de categoría del archivo (primer
 * segmento del kebab-case) vale doble. Empates: menos tokens sobrantes gana
 * (nombre más específico al query).
 */
export function pickReferenceBlock(
  files: string[],
  query: { archetype: string; brief: string; path: string; component: string },
): string | null {
  const strong = expand(tokenize(`${query.archetype} ${query.path} ${query.component}`))
  const weak = expand(tokenize(query.brief))
  let best: string | null = null
  let bestScore = 0
  for (const file of files) {
    const tokens = tokenize(file.replace(/\.tsx$/, ""))
    if (tokens.length === 0) continue
    const category = tokens[0]
    let score = 0
    for (const [i, tok] of tokens.entries()) {
      const catBonus = i === 0 ? 1 : 0
      if (strong.has(tok)) score += 3 + catBonus * 2
      else if (weak.has(tok)) score += 1 + catBonus
    }
    // Normaliza levemente por longitud: un nombre de 10 tokens con 2 matches
    // no debe ganarle a uno de 4 tokens con 2 matches.
    const normalized = score - tokens.length * 0.15
    if (normalized > bestScore) {
      bestScore = normalized
      best = file
    }
  }
  // Umbral: sin un match real de estructura (≥ un token fuerte), sin base.
  return bestScore >= 3 ? best : null
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
  /**
   * Epoch ms: si la PRIMERA pasada falla la validación DESPUÉS de este
   * instante, NO se reintenta (throw con marcador __BUDGET__) — lo usa
   * materialize_site para no rebasar el techo de función de la plataforma;
   * la sección se re-dibuja en la siguiente invocación con presupuesto fresco.
   */
  retryDeadline?: number
}

/**
 * Core reutilizable: dibuja UNA sección custom. Lo usan draft_section (single)
 * y draft_sections (plural, en paralelo). Normaliza la ruta, arma el prompt,
 * llama al modelo del router `codegen`, valida (con reintento) y escribe al
 * sandbox. Lanza claro si no valida ni con reintento.
 */
export async function draftOneSection(
  {
    path,
    component,
    ns,
    archetype,
    brief,
    isSlot,
    useClient,
    retryDeadline,
  }: DraftSectionInput,
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

    const sandbox = await ctx.getSandbox()

    // Retrieval automático: el mejor bloque de reference/blocks como BASE. Se
    // salta si el orquestador YA pegó una base en el brief (override manual).
    let baseFile: string | null = null
    let baseCode: string | null = null
    if (!/BASE A ADAPTAR|COMPONENTE BASE/i.test(brief)) {
      try {
        const files = await listReferenceBlocks(sandbox)
        baseFile = pickReferenceBlock(files, { archetype, brief, path, component })
        if (baseFile) {
          baseCode = await sandbox.readTextFile({
            path: `site/reference/blocks/${baseFile}`,
          })
          // Bases desproporcionadas inflan el prompt sin aportar: cap 16KB.
          if (baseCode && baseCode.length > 16_000) baseCode = null
        }
      } catch {
        baseFile = null
        baseCode = null
      }
    }

    const baseBlock = baseCode
      ? `
COMPONENTE BASE DE LA BIBLIOTECA (código real y probado, el más afín al arquetipo — tu punto de PARTIDA obligado):
--- reference/blocks/${baseFile} ---
${baseCode}
--- fin del base ---

CÓMO ADAPTARLO (no negociable):
- PARTE de su ESTRUCTURA: conserva la densidad, las capas, la jerarquía y los microdetalles (badges, rules, numeraciones, hovers) que lo hacen verse de agencia. PROHIBIDO resumirlo a una versión plana o más corta.
- Cambia TODO el contenido al de este sitio: copy vía t()/t.raw() del ns, datos de config.business, imágenes del brief.
- El base puede violar los contratos de ESTE template (otra librería de iconos, next/image, hex, py-* propios, textos hardcodeados): CORRÍGELO al adaptar — las REGLAS DURAS y los CONTRATOS de arriba SIEMPRE ganan.
- Divergencia real: ajusta proporciones/composición a lo que pida el brief; nunca un verbatim.
`
      : ""

    const prompt = `Eres un ingeniero de front-end senior escribiendo UNA sección de un sitio Next.js (App Router, RSC, Tailwind v4, shadcn) hecho a la medida de una agencia. Materializas el criterio de diseño que se te dicta — sin improvisar contenido ni layout genérico.

${SECTION_RULES}

${PRIMITIVES}

ARCHIVO A ESCRIBIR: components/custom/${path.split("/").pop()}
- Export: ${useClient ? '"use client" en la PRIMERA línea, luego ' : ""}\`export function ${component}({ ns }: { ns: string })\`.
- Namespace de copy (ns): "${ns}".
- Arquetipo estructural: ${archetype}.
${isSlot ? "- Es SLOT (header/footer): emite el contenido INTERIOR, NO uses <Section> ni <header>/<footer> (los pone el motor)." : ""}
${baseBlock}
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
    // Guard de densidad: con base inyectada, una adaptación no-slot que quede
    // muy por debajo del base es el modelo APLANANDO (la causa del "corto").
    const minBytes =
      baseCode && !isSlot ? Math.max(2000, Math.floor(baseCode.length * 0.4)) : 0
    const densityProblem = (source: string): string | null =>
      minBytes > 0 && source.length < minBytes
        ? `la adaptación quedó demasiado corta/plana (${source.length} bytes vs base de ${baseCode?.length}): conserva la densidad estructural del componente base, no lo resumas`
        : null
    const first = await generateText({ model, prompt })
    await recordToolUsage(ctx, "site-builder", modelUsed, first.usage)
    let result = stripFences(first.text)
    let problem =
      (await validate(result, { isSlot: !!isSlot, ns })) ?? densityProblem(result)
    if (problem) {
      if (retryDeadline !== undefined && Date.now() > retryDeadline) {
        throw new Error(
          `__BUDGET__ la sección falló la validación (${problem}) y ya no hay presupuesto de invocación para reintentar — se re-dibuja en la siguiente llamada.`,
        )
      }
      retried = true
      // Reintento informándole el defecto (mismo modelo: es capaz, solo resbaló).
      const retry = await generateText({
        model,
        prompt: `${prompt}\n\nOJO: un intento anterior falló la validación por: ${problem}. Corrígelo sin romper lo demás.`,
      })
      await recordToolUsage(ctx, "site-builder", modelUsed, retry.usage)
      result = stripFences(retry.text)
      problem =
        (await validate(result, { isSlot: !!isSlot, ns })) ?? densityProblem(result)
      if (problem) {
        throw new Error(
          `La sección generada no validó ni con reintento (${problem}). Escríbela tú directo con las herramientas del sandbox (write_file) aplicando taste + anti-generic.`,
        )
      }
    }

    await sandbox.writeTextFile({ path: `site/${path}`, content: result })
    void recordToolTiming(ctx, "site-builder", "draft_section", Date.now() - t0, {
      ok: true,
      meta: {
        archetype,
        model: modelUsed,
        retried,
        bytes: result.length,
        isSlot: !!isSlot,
        base: baseFile,
      },
    })
    return {
      path: `site/${path}`,
      component,
      ns,
      bytes: result.length,
      model: modelUsed,
      ...(baseFile ? { adaptedFrom: `reference/blocks/${baseFile}` } : {}),
      hint: "Sección escrita y validada (sintaxis, tokens, next-intl). Cuando tengas todas, corre assemble_registry (determinista) y luego build_check. Correcciones puntuales tras QA/build: edit_file, no re-generes la sección entera.",
    }
}
