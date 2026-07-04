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

/** Secciones commodity del motor: no requieren `why` creativo propio. */
const COMMODITY_SECTIONS = new Set([
  "navbar",
  "footer",
  "contact",
  "trust-bar",
  "cta-band",
  "faq",
  "page-header",
  "aviso",
])

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

/**
 * Validación laxa del spec: el contrato completo lo valida el template
 * (scripts/validate-config.ts con zod estricto) durante el build. Aquí solo
 * se exige la estructura mínima para que el historial sea útil.
 */
const specSchema = z
  .object({
    version: z.number().int().min(1),
    mode: z.enum(["new", "redesign"]),
    industry: z.string().min(1),
    business: z.record(z.string(), z.unknown()),
    design: z.object({
      preset: z.string().min(1),
      variation_notes: z.string().min(10),
      palette: z.record(z.string(), z.unknown()),
      fonts: z.record(z.string(), z.unknown()),
    }).passthrough(),
    sections: z.array(z.record(z.string(), z.unknown())).min(3),
    seo: z.record(z.string(), z.unknown()),
    flags: z.record(z.string(), z.unknown()),
  })
  .passthrough()

export default defineTool({
  description:
    "Guarda una nueva versión del spec en site_versions (version_n incremental) y actualiza sites.current_version. Valida pensamiento de diseño: exige design.concept (idea rectora), `why` por sección de contenido, design.references con takeaways cuando hay biblioteca, y rechaza esqueletos clonados de sitios recientes (orden+variants), páginas interiores de plantilla, specs que ignoran la ficha de marca y la convergencia preset+hero+acento dentro del giro.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    spec: specSchema.describe(
      "Spec completo de la versión (contrato brief→código). Debe incluir design.variation_notes justificando cómo se varió el preset.",
    ),
    changelog: z
      .string()
      .min(10)
      .describe("Qué cambió en esta versión respecto a la anterior (o 'versión inicial')."),
  }),
  async execute({ siteId, spec, changelog }) {
    // La ficha de marca es obligatoria cuando existe: un spec que la ignora
    // produce el sitio genérico que la ficha vino a matar.
    {
      const site = await getSite(siteId)
      const { getSupabaseClient } = await import("../../../lib/supabase")
      const { data: brand } = await getSupabaseClient()
        .from("lead_brand")
        .select("short_name, logo_path, icon_path, colors, services")
        .eq("lead_id", site.lead_id)
        .maybeSingle()
      if (brand) {
        const business = spec.business as Record<string, unknown>
        const problems: string[] = []
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
        if (problems.length > 0) {
          throw new Error(
            `Spec rechazado — ignora la ficha de marca del lead:\n- ${problems.join("\n- ")}\nRelee brand en get_site_brief e incorpóralo al spec.`,
          )
        }
      }
    }
    const sections = spec.sections as Array<Record<string, unknown>>
    const hero = sections.find((s) => s["id"] === "hero")
    const heroVariant = hero?.["variant"] as string | undefined
    const design = spec.design as Record<string, unknown>

    // ——— Reglas de creatividad: el spec debe PENSAR, no rellenar el menú ———
    {
      const problems: string[] = []

      // 1. Concepto rector: la idea que gobierna el sitio completo.
      const concept = design["concept"]
      if (typeof concept !== "string" || concept.trim().length < 60) {
        problems.push(
          "falta design.concept: la idea rectora del sitio en 2-3 frases (qué debe sentir y hacer el visitante, y qué gesto de diseño lo logra). Todo el spec se deriva de ella.",
        )
      }

      // 2. Cada sección de contenido justifica su existencia y su layout.
      const missingWhy = sections.filter(
        (s) =>
          !COMMODITY_SECTIONS.has(String(s["id"])) &&
          (typeof s["why"] !== "string" || String(s["why"]).trim().length < 20),
      )
      if (missingWhy.length > 0) {
        problems.push(
          `secciones sin \`why\` (${missingWhy
            .map((s) => String(s["component"] ?? s["id"]))
            .join(", ")}): cada sección de contenido declara qué pregunta del visitante responde y por qué ESE layout la responde mejor.`,
        )
      }

      // 3. Con biblioteca de referencias disponible, el spec cita qué robó.
      const refsAvailable = await countAnalyzedReferences()
      const declaredRefs = (design["references"] ?? []) as Array<
        Record<string, unknown>
      >
      const withTakeaways = declaredRefs.filter(
        (r) => typeof r["takeaways"] === "string" && String(r["takeaways"]).length > 20,
      )
      if (refsAvailable > 0 && withTakeaways.length === 0) {
        problems.push(
          `hay ${refsAvailable} referencias analizadas en la biblioteca y el spec no declara design.references[{slug, takeaways}] — relee designReferences del brief y decide qué robas de cada una (composición, ritmo cromático, jerarquía) y qué no.`,
        )
      }

      // 4. Anti-clon estructural: dos sitios no comparten esqueleto, sea cual
      // sea el giro. Se compara la secuencia id:variant de la home (sin
      // navbar/footer/contact) contra los sitios más recientes.
      const signature = sections
        .filter(
          (s) => !["navbar", "footer", "contact"].includes(String(s["id"])),
        )
        .map((s) => {
          const id = String(s["id"] ?? "")
          const key = id === "custom" ? `custom:${s["component"] ?? ""}` : id
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

      if (problems.length > 0) {
        throw new Error(
          `Spec rechazado — le falta pensamiento de diseño:\n- ${problems.join("\n- ")}\nCorrige TODO en una pasada y reintenta save_site_version.`,
        )
      }
    }
    const palette = (design["palette"] ?? {}) as Record<string, unknown>
    const dark = (palette["dark"] ?? palette["light"] ?? {}) as Record<
      string,
      unknown
    >
    const accent = dark["accent"] as string | undefined

    // Anti-convergencia: dos clientes del mismo giro no comparten
    // preset + hero + acento exactos.
    const siblings = await getSiblingSpecs({
      industry: spec.industry,
      excludeSiteId: siteId,
    })
    const clash = siblings.find(
      (s) =>
        s.preset === design["preset"] &&
        s.heroVariant === heroVariant &&
        s.accent === accent,
    )
    if (clash) {
      throw new Error(
        `Regla anti-convergencia: otro sitio del giro "${spec.industry}" ya usa preset=${clash.preset} + hero=${clash.heroVariant} + acento=${clash.accent}. Cambia al menos uno (normalmente el acento: varía el hue ±15-30°).`,
      )
    }

    const { versionN } = await insertSiteVersion({
      siteId,
      spec,
      changelog,
      actor: "site-builder",
    })

    const site = await getSite(siteId)
    await addActivity({
      leadId: site.lead_id,
      type: "site_version_created",
      note: `v${versionN}: ${changelog}`,
      actor: "site-builder",
    })

    return { versionN }
  },
})
