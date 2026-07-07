import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity } from "../../../lib/leads"
import {
  countAnalyzedReferences,
  getRecentHomeSignatures,
  getSiblingSpecs,
  getSite,
  insertSiteVersion,
} from "../lib/sites"
import { repairedObject, repairedRecord } from "../lib/spec-repair"

/**
 * Validación laxa del spec: el contrato completo lo valida el template
 * (scripts/validate-config.ts con zod estricto) durante el build. Aquí solo
 * se exige la estructura mínima para que el historial sea útil. Todos los
 * objetos anidados toleran llegar serializados como string (repairedRecord):
 * se reparan, o se rechazan con el texto recibido dentro del error.
 */
const sectionRecord = repairedRecord("elemento de sections[]")

const specSchema = z
  .object({
    version: z.number().int().min(1),
    // "edit" = bump post-venta (modo edit, delta quirúrgico sobre un sitio
    // ya vendido): salta el gauntlet creativo de sitio-nuevo (ver execute).
    mode: z.enum(["new", "redesign", "edit"]),
    industry: z.string().min(1),
    business: repairedRecord("business"),
    design: repairedObject(
      "design",
      z
        .object({
          // Ya NO hay presets: el theme se diseña a la medida. La paleta es
          // la fuente de verdad; el radius lo decide el registro del negocio.
          palette: repairedRecord("design.palette"),
          fonts: repairedRecord("design.fonts"),
        })
        .passthrough(),
    ),
    sections: z.array(sectionRecord).min(3),
    seo: repairedRecord("seo"),
    flags: repairedRecord("flags"),
    pages: z
      .array(
        repairedObject(
          "elemento de pages[]",
          z
            .object({
              sections: z
                .array(repairedRecord("sección de página interior"))
                .optional(),
            })
            .passthrough(),
        ),
      )
      .optional(),
  })
  .passthrough()

/**
 * Familia de arquetipo de un bloque de la biblioteca, derivada del prefijo de
 * su key. Dos bloques de la MISMA familia producen el mismo gesto visual
 * (eyebrow + título + grid/lista) aunque tengan key distinta — apilarlos es la
 * "monotonía de layout" que abarata el sitio. Se usa para exigir ritmo.
 */
function blockFamily(blockKey: string): string {
  const k = blockKey.toLowerCase()
  const table: Array<[RegExp, string]> = [
    [/^about|manifesto|editorial-intro|callout-quote/, "editorial"],
    [/^feature|values-cards|bento|offset-cards/, "features"],
    [/^services/, "services"],
    [/^process|steps/, "process"],
    [/^gallery|image-fullbleed/, "gallery"],
    [/^stat|metric/, "stats"],
    [/^cta|split-cta|banner-statement/, "cta"],
    [/^faq/, "faq"],
    [/^logo/, "logos"],
    [/^testimonial/, "testimonial"],
    [/^pricing|comparison|product-spec/, "pricing"],
    [/^history/, "timeline"],
    [/^hours|coverage/, "info"],
    [/^team/, "team"],
    [/^certifications|download/, "misc"],
  ]
  for (const [re, fam] of table) if (re.test(k)) return fam
  return `block:${k}`
}

/** Longitud de la subsecuencia común más larga (orden preservado). */
function lcsLength(a: string[], b: string[]): number {
  const dp: number[] = new Array(b.length + 1).fill(0)
  for (const tokenA of a) {
    let prev = 0
    for (let j = 0; j < b.length; j++) {
      const tmp = dp[j + 1]
      dp[j + 1] = tokenA === b[j] ? prev + 1 : Math.max(dp[j + 1], dp[j])
      prev = tmp
    }
  }
  return dp[b.length]
}

/** hex (#rrggbb) → HSL (h en grados 0-360, s/l en 0-1). null si no parsea. */
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = (((g - b) / d) % 6 + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s, l }
}

/** Distancia angular mínima entre dos hues (grados, 0-180). */
function hueDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * hex (#rrggbb) → string `oklch(L C H)` (OKLab de Björn Ottosson, determinista).
 * Precalcular esto en el tool le AHORRA al site-builder instalar coloraide +
 * correr python para convertir la paleta cada build (4-6 comandos de Sonnet).
 * null si no parsea. Achromático → hue 0 (mismo criterio que coloraide).
 */
function hexToOklch(hex: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  const R = toLinear(((n >> 16) & 255) / 255)
  const G = toLinear(((n >> 8) & 255) / 255)
  const B = toLinear((n & 255) / 255)
  // linear sRGB → LMS' (raíz cúbica)
  const l_ = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m_ = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s_ = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  // LMS' → OKLab
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const chroma = Math.sqrt(a * a + b * b)
  let hue = (Math.atan2(b, a) * 180) / Math.PI
  if (hue < 0) hue += 360
  const round = (x: number, d: number) => Number(x.toFixed(d))
  return `oklch(${round(L, 4)} ${round(chroma, 4)} ${chroma < 1e-4 ? 0 : round(hue, 2)})`
}

/** Convierte un record de rol→hex a rol→oklch (ignora valores no-hex). */
function paletteToOklch(
  modeColors: unknown,
): Record<string, string> | undefined {
  if (!modeColors || typeof modeColors !== "object") return undefined
  const out: Record<string, string> = {}
  for (const [role, val] of Object.entries(
    modeColors as Record<string, unknown>,
  )) {
    const o = typeof val === "string" ? hexToOklch(val) : null
    if (o) out[role] = o
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Texto libre que puede venir como string o array de strings (Postel). */
function asText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string").join(" ")
  }
  return ""
}

export default defineTool({
  description:
    "Guarda una nueva versión del spec en site_versions (version_n incremental) y actualiza sites.current_version. Con mode 'new'/'redesign' valida pensamiento de diseño: exige design.concept (idea rectora), `why` por sección de contenido, design.references con takeaways cuando hay biblioteca, y rechaza esqueletos clonados de sitios recientes (orden+variants), páginas interiores de plantilla, specs que ignoran la ficha de marca y la convergencia acento+hero dentro del giro. Con mode 'edit' (bump post-venta sobre un sitio ya vendido) SALTA ese gauntlet creativo — es un delta quirúrgico, no un sitio nuevo — y solo persiste versión+changelog.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    spec: specSchema.describe(
      "Spec completo de la versión (contrato brief→código). Debe incluir design.concept (idea rectora), design.palette (light+dark a la medida), design.radius, design.fonts{display,body}, design.references[{slug, takeaways}] y `why` en cada sección de contenido.",
    ),
    changelog: z
      .string()
      .min(10)
      .describe("Qué cambió en esta versión respecto a la anterior (o 'versión inicial')."),
  }),
  async execute({ siteId, spec, changelog }) {
    // TODOS los problemas se juntan y se lanzan en UN solo error: el agente
    // corrige todo en una pasada en vez de jugar ping-pong con el validador.
    const problems: string[] = []
    const site = await getSite(siteId)

    // mode:"edit" (bump post-venta) salta TODO el gauntlet de
    // sitio-nuevo: concepto, `why` por sección, anti-clon, anti-convergencia,
    // multipágina. Una edición quirúrgica es un delta sobre un sitio que ya
    // pasó ese gauntlet; re-correrlo rechazaría cambios legítimos (p. ej. por
    // parecerse a un sitio MÁS nuevo). Solo persiste versión + changelog.
    const mode = String((spec as Record<string, unknown>)["mode"] ?? "new")
    if (mode !== "edit") {

    // ——— Ficha de marca: obligatoria cuando existe ———
    {
      const { getSupabaseClient } = await import("../../../lib/supabase")
      const { data: brand } = await getSupabaseClient()
        .from("lead_brand")
        .select("short_name, logo_path, icon_path, colors, services")
        .eq("lead_id", site.lead_id)
        .maybeSingle()
      if (brand) {
        const business = spec.business as Record<string, unknown>
        if (brand.short_name && !business["shortName"]) {
          problems.push(
            `la ficha tiene short_name="${brand.short_name}" y el spec no trae business.shortName`,
          )
        }
        if (brand.logo_path && !business["logo"]) {
          problems.push(
            "la ficha tiene logo y el spec no declara business.logo (descárgalo en fase build a public/images/)",
          )
        }
        if (brand.icon_path && !business["icon"]) {
          problems.push(
            "la ficha tiene isotipo y el spec no declara business.icon",
          )
        }
        const brandColors = (brand.colors as string[]) ?? []
        if (brandColors.length > 0) {
          const specText = JSON.stringify(spec.design).toLowerCase()
          const used = brandColors.some((c) =>
            specText.includes(String(c).toLowerCase()),
          )
          if (!used) {
            problems.push(
              `la paleta del spec no usa ninguno de los colores de marca (${brandColors.join(", ")}) — armonízalos como base`,
            )
          }
        }
        // Multi-página es la norma: con 3+ servicios reales en la ficha, un
        // one-pager es un spec flojo salvo justificación explícita.
        const services = (brand.services as unknown[] | null) ?? []
        const pages = (spec as Record<string, unknown>)["pages"] as
          | unknown[]
          | undefined
        if (
          Array.isArray(services) &&
          services.length >= 3 &&
          (!pages || pages.length === 0) &&
          !changelog.toLowerCase().includes("one-pager")
        ) {
          problems.push(
            `la ficha tiene ${services.length} servicios reales y el spec no declara páginas interiores (mínimo /servicios) — o justifica el one-pager escribiendo "one-pager" con la razón en el changelog`,
          )
        }
      }
    }

    const sections = spec.sections as Array<Record<string, unknown>>
    const design = spec.design as Record<string, unknown>

    // ——— Reglas de creatividad: el spec debe PENSAR, no rellenar el menú ———

    // 1. Concepto rector: la idea que gobierna el sitio completo.
    if (asText(design["concept"]).trim().length < 60) {
      problems.push(
        "falta design.concept: la idea rectora del sitio en 2-3 frases (qué debe sentir y hacer el visitante, y qué gesto de diseño lo logra). Todo el spec se deriva de ella.",
      )
    }

    // 2. Cada sección de CONTENIDO justifica su existencia y su layout. El
    // header y el footer (slots) son chrome estructural: no requieren `why`
    // creativo. Todo lo demás (body) sí.
    const missingWhy = sections.filter(
      (s) =>
        s["slot"] !== "header" &&
        s["slot"] !== "footer" &&
        asText(s["why"] ?? s["rationale"]).trim().length < 20,
    )
    if (missingWhy.length > 0) {
      problems.push(
        `secciones sin \`why\` (${missingWhy
          .map((s) => String(s["component"] ?? s["id"]))
          .join(", ")}): cada sección de contenido declara qué pregunta del visitante responde y por qué ESE layout la responde mejor.`,
      )
    }

    // 2c. Ritmo de arquetipos: la home no puede ser el mismo gesto repetido.
    // Se miran los bloques de contenido de la home por FAMILIA de arquetipo
    // (blockFamily): apilar bloques de la misma familia = "monotonía de layout"
    // (4 secciones eyebrow+título+lista se leen a plantilla). Reglas: nada de
    // 3 bloques seguidos de la misma familia, y ≥50% de familias distintas.
    {
      const blockFams = sections
        .filter((s) => String(s["id"]) === "block")
        .map((s) => blockFamily(String(s["block"] ?? "")))
      if (blockFams.length >= 3) {
        // 3 consecutivos de la misma familia
        let run = 1
        let worstFam = ""
        let maxRun = 1
        for (let i = 1; i < blockFams.length; i++) {
          run = blockFams[i] === blockFams[i - 1] ? run + 1 : 1
          if (run > maxRun) {
            maxRun = run
            worstFam = blockFams[i]
          }
        }
        if (maxRun >= 3) {
          problems.push(
            `monotonía de layout: ${maxRun} bloques seguidos de la familia "${worstFam}" (mismo gesto: eyebrow+título+grid/lista). Alterna arquetipos vecinos (denso/aireado, cifras/lista, imagen/texto) o mete una custom entre medias — un sitio de venta tiene ritmo, no la misma tarjeta N veces.`,
          )
        }
        // diversidad global de familias
        const distinct = new Set(blockFams).size
        if (distinct / blockFams.length < 0.5) {
          problems.push(
            `poca diversidad de arquetipos: ${blockFams.length} bloques pero solo ${distinct} familia(s) distinta(s) [${[...new Set(blockFams)].join(", ")}]. Elige bloques de familias variadas del catálogo (about, features, process, stats, gallery, cta…), no repitas la misma forma.`,
          )
        }
      }
    }

    // 3. Con biblioteca de referencias disponible, el spec cita qué robó.
    // Tolerante en shape: slug/refSlug/ref/id; takeaways string o array.
    const refsAvailable = await countAnalyzedReferences()
    const declaredRefs = (design["references"] ??
      (spec as Record<string, unknown>)["references"] ??
      []) as Array<Record<string, unknown>>
    const withTakeaways = Array.isArray(declaredRefs)
      ? declaredRefs.filter(
          (r) =>
            asText(
              r["takeaways"] ?? r["takeaway"] ?? r["steal"] ?? r["notes"],
            ).trim().length > 20,
        )
      : []
    if (refsAvailable > 0 && withTakeaways.length === 0) {
      const received = JSON.stringify(declaredRefs ?? []).slice(0, 400)
      problems.push(
        `hay ${refsAvailable} referencias analizadas y el spec no declara qué roba de las que recibió en el brief. Formato esperado: design.references = [{slug: "<slug de la referencia>", takeaways: "qué robas (composición, ritmo cromático, jerarquía) y qué no"}]. Lo que llegó: ${received}`,
      )
    }

    // 4. Anti-clon estructural: dos sitios no comparten esqueleto, sea cual
    // sea el giro. Se compara la secuencia id:variant de la home (sin
    // navbar/footer/contact) contra los sitios más recientes.
    const signature = sections
      .filter((s) => !["navbar", "footer", "contact"].includes(String(s["id"])))
      .map((s) => {
        const id = String(s["id"] ?? "")
        const key =
          id === "custom"
            ? `custom:${s["component"] ?? ""}`
            : id === "block"
              ? `block:${s["block"] ?? ""}`
              : id
        return `${key}:${s["variant"] ?? "-"}`
      })
    const previous = await getRecentHomeSignatures({ excludeSiteId: siteId })
    for (const prev of previous) {
      const sim =
        lcsLength(signature, prev.signature) /
        Math.max(signature.length, prev.signature.length)
      if (sim >= 0.75) {
        problems.push(
          `la home comparte el ${Math.round(sim * 100)}% del esqueleto (orden + variants) con un sitio reciente [${prev.signature.join(" → ")}]. Recompón: cambia el ORDEN según tu concepto, sustituye variants del motor por secciones custom, o fusiona/parte secciones. El esqueleto canónico hero→trust-bar→services→about→faq→cta no es un default aceptable.`,
        )
        break
      }
    }

    // 5. Páginas interiores diseñadas, no de plantilla: prohibido que TODAS
    // sean `page-header + una sección + cta-band`.
    const pages = (spec as Record<string, unknown>)["pages"] as
      | Array<Record<string, unknown>>
      | undefined
    if (Array.isArray(pages) && pages.length > 0) {
      const isMolde = (p: Record<string, unknown>) => {
        const secs = (p["sections"] ?? []) as Array<Record<string, unknown>>
        return (
          secs.length <= 3 &&
          String(secs[0]?.["id"]) === "page-header" &&
          String(secs[secs.length - 1]?.["id"]) === "cta-band"
        )
      }
      if (pages.every(isMolde)) {
        problems.push(
          "todas las páginas interiores son la plantilla `page-header + una sección + cta-band`. Una página interior es una PÁGINA: al menos una necesita estructura propia (4+ secciones, o una custom, o un layout que desglose el contenido — cada servicio con su ángulo, no una lista).",
        )
      }
    }

    // ——— Anti-convergencia dentro del giro: ACENTO ———
    // En el motor 100%-custom no hay hero/navbar variants: la firma visual de
    // entrada compartida entre sitios es el ACENTO de la paleta. Dos sitios del
    // giro con un acento casi del mismo tono (hue) se ven gemelos de entrada por
    // más que el layout difiera. Se compara la proximidad de hue (la dirección
    // de arte tiene la orden de variar ±15-30°, anclado a la marca).
    const palette = (design["palette"] ?? {}) as Record<string, unknown>
    const dark = (palette["dark"] ?? palette["light"] ?? {}) as Record<
      string,
      unknown
    >
    const accent = dark["accent"] as string | undefined
    const siblings = await getSiblingSpecs({
      industry: spec.industry,
      excludeSiteId: siteId,
    })
    const specHsl = accent ? hexToHsl(accent) : null
    // Solo acentos SATURADOS: un acento casi gris (s<0.15) no tiene hue estable
    // y comparar su tono daría falsos positivos.
    if (specHsl && specHsl.s >= 0.15) {
      const clash = siblings.find((s) => {
        if (!s.accent) return false
        const h = hexToHsl(s.accent)
        return h !== null && h.s >= 0.15 && hueDelta(h.h, specHsl.h) < 18
      })
      if (clash) {
        problems.push(
          `otro sitio del giro "${spec.industry}" ya usa un acento casi del mismo tono (${clash.accent}) que el tuyo (${accent}) — se verían gemelos de entrada. Varía el HUE del acento ±15-30° (siempre anclado a la marca del cliente).`,
        )
      }
    }

    } // fin del gauntlet de sitio-nuevo (se salta con mode:"edit")

    if (problems.length > 0) {
      throw new Error(
        `Spec rechazado (${problems.length} ${problems.length === 1 ? "problema" : "problemas"} — TODOS listados, corrígelos en UNA pasada y reintenta):\n- ${problems.join("\n- ")}`,
      )
    }

    // Precalcula la paleta en OKLCH (lo que consume app/theme.css) y la guarda
    // en design.paletteOklch para que el site-builder la copie directo en vez
    // de instalar coloraide + convertir hex→oklch en vivo (4-6 comandos de
    // Sonnet por build). La paleta hex se conserva (anti-convergencia + og-*
    // en hex que Satori necesita). Corre en ambos modos.
    {
      const designObj = (spec as Record<string, unknown>)["design"] as
        | Record<string, unknown>
        | undefined
      if (designObj) {
        const pal = (designObj["palette"] ?? {}) as Record<string, unknown>
        const oklch: Record<string, Record<string, string>> = {}
        const light = paletteToOklch(pal["light"])
        const dark = paletteToOklch(pal["dark"])
        if (light) oklch["light"] = light
        if (dark) oklch["dark"] = dark
        if (Object.keys(oklch).length > 0) designObj["paletteOklch"] = oklch
      }
    }

    const { versionN } = await insertSiteVersion({
      siteId,
      spec,
      changelog,
      actor: "site-builder",
    })

    await addActivity({
      leadId: site.lead_id,
      type: "site_version_created",
      note: `v${versionN}: ${changelog}`,
      actor: "site-builder",
    })

    return { versionN }
  },
})
