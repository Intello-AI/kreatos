import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"
import {
  getDesignReferences,
  getLatestVersion,
  getSiblingSpecs,
  getSite,
} from "../lib/sites"

export default defineTool({
  description:
    "Punto de partida de toda corrida: devuelve el site (brief del dashboard), el lead completo, el spec de la última versión si existe, referencias curadas del giro y un resumen de sitios previos del mismo giro (para la regla anti-convergencia). El theme se diseña a la medida (no hay presets).",
  inputSchema: z.object({
    siteId: z.string().uuid().describe("id de la fila en `sites`."),
    industry: z
      .string()
      .optional()
      .describe(
        "Giro normalizado para buscar referencias (ej. 'contable', 'construccion', 'logistica', 'distribucion'). Si se omite, NO se traen referencias ni sitios hermanos (ahorra ~2-8K tokens del brief). OMÍTELO cuando ya vas a construir desde latestSpec (el art-director ya compuso el spec con sus referencias): solo pásalo cuando TÚ vas a componer el spec y necesitas ver referencias del giro.",
      ),
  }),
  async execute({ siteId, industry }) {
    // allowCancelled: al RETOMAR un site cancelado el primer paso es leer el
    // brief; el resto de tools sí abortan mientras siga cancelled.
    const site = await getSite(siteId, { allowCancelled: true })

    const supabase = getSupabaseClient()
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", site.lead_id)
      .maybeSingle()
    if (error) throw new Error(`Lectura del lead falló: ${error.message}`)
    if (!lead) throw new Error(`El site ${siteId} apunta a un lead inexistente.`)

    // Ficha de marca del lead (logo, colores, nombre corto, servicios reales).
    const { data: brand } = await supabase
      .from("lead_brand")
      .select("*")
      .eq("lead_id", site.lead_id)
      .maybeSingle()
    const supabaseUrl = process.env.SUPABASE_URL ?? ""
    const logoUrl =
      brand?.logo_path && supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/brand-assets/${brand.logo_path}`
        : null
    const iconUrl =
      brand?.icon_path && supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/brand-assets/${brand.icon_path}`
        : null
    // Fotos reales aprobadas por el curador, listas para descargar al sandbox.
    const imageUrls = (((brand?.images as string[] | null) ?? []) as string[])
      .filter(Boolean)
      .map((p) => `${supabaseUrl}/storage/v1/object/public/brand-assets/${p}`)

    const [latestVersion, references, siblings] = await Promise.all([
      getLatestVersion(siteId),
      industry
        ? getDesignReferences({ industry, limit: 3 })
        : Promise.resolve([]),
      industry
        ? getSiblingSpecs({ industry, excludeSiteId: siteId })
        : Promise.resolve([]),
    ])

    return {
      site: {
        id: site.id,
        slug: site.slug,
        status: site.status,
        brief: site.brief,
        repoUrl: site.repo_url,
        vercelProjectId: site.vercel_project_id,
        currentVersion: site.current_version,
      },
      lead,
      // null = José no ha llenado la ficha; aplica la política de datos
      // faltantes. Con brand: shortName/colores/logo son OBLIGATORIOS de usar.
      brand: brand ? { ...brand, logoUrl, iconUrl, imageUrls } : null,
      latestSpec: latestVersion?.spec ?? null,
      latestVersionN: latestVersion?.version_n ?? null,
      // Con screenshotUrl/screenshotMobileUrl: pásalas a
      // view_reference_screenshots para VER la referencia (no solo su CSS).
      designReferences: references.map((ref) => ({
        ...ref,
        screenshotUrl: ref.screenshot_path
          ? `${supabaseUrl}/storage/v1/object/public/design-references/${ref.screenshot_path}`
          : null,
        screenshotMobileUrl: ref.screenshot_mobile_path
          ? `${supabaseUrl}/storage/v1/object/public/design-references/${ref.screenshot_mobile_path}`
          : null,
      })),
      siblingSites: siblings,
    }
  },
})
