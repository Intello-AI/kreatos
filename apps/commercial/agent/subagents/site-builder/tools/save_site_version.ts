import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity } from "../../../lib/leads"
import { getSiblingSpecs, getSite, insertSiteVersion } from "../lib/sites"

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
    "Guarda una nueva versión del spec en site_versions (version_n incremental) y actualiza sites.current_version. Aplica la regla anti-convergencia: rechaza el spec si otro sitio del mismo giro ya usa exactamente el mismo preset + variante de hero + acento.",
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
        .select("short_name, logo_path, icon_path, colors")
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
