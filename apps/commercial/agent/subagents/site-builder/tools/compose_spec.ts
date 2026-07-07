import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"
import { getSite } from "../lib/sites"

/**
 * Andamiaje MECÁNICO del spec: ensambla desde el lead + la ficha + el brief los
 * bloques que NO son decisión creativa — `business` (nombre, contacto, ficha de
 * Google, rutas de logo/icono), `flags` y `seo.domain` — en la FORMA EXACTA que
 * el spec espera. El art-director los copia VERBATIM en vez de transcribirlos a
 * mano.
 *
 * Por qué existe: `business` es el bloque que el modelo más mis-serializa al
 * emitir el spec gigante (por eso `save_site_version` trae `repairedRecord` y se
 * queja de shortName/logo/icon faltantes). Esos campos YA están en la BDD, con
 * shape fijo (el `maps` de Google, las rutas /images/logo.png) — armarlos en
 * código elimina esa clase de error y ese output.
 *
 * NO decide nada creativo ni persiste: solo devuelve el scaffold + un `todo`
 * con lo que el modelo SÍ debe componer con criterio (address parseado, geo,
 * categoría legible, hours, seo copy, design, sections, pages). El spec
 * completo sigue yendo a `save_site_version` (que corre el gauntlet creativo).
 */

/** URL del sitio viejo → dominio limpio (sin protocolo, path ni www). */
function toDomain(website: string | null | undefined): string | undefined {
  if (!website) return undefined
  try {
    const u = new URL(website.includes("://") ? website : `https://${website}`)
    return u.hostname.replace(/^www\./, "") || undefined
  } catch {
    return undefined
  }
}

/** maps_uri de Google (con basura &g_mp=…) → uri canónica por cid. */
function cleanMapsUri(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined
  const cid = /[?&]cid=(\d+)/.exec(uri)
  return cid ? `https://maps.google.com/?cid=${cid[1]}` : uri
}

export default defineTool({
  description:
    "Ensambla el andamiaje MECÁNICO del spec desde el lead + ficha + brief: el bloque `business` (nombre, shortName, teléfono, email, `maps` de Google, rutas logo/icon), `flags` (contactForm/whatsappFloat/multiLang/themeToggle) y `seo.domain`, en la forma EXACTA del spec. Llámalo ANTES de componer el spec: copia lo que devuelve VERBATIM (ya trae el maps/logo/icon correctos, la fuente de mis-serialización más común) y completa con tu criterio lo que liste en `todo` (address parseado, geo, categoría legible, hours, seo copy, design, sections, pages). NO persiste ni decide diseño — el spec completo va a save_site_version.",
  inputSchema: z.object({
    siteId: z.string().uuid().describe("id de la fila en `sites`."),
  }),
  async execute({ siteId }) {
    const site = await getSite(siteId, { allowCancelled: true })
    const supabase = getSupabaseClient()

    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", site.lead_id)
      .maybeSingle()
    if (error) throw new Error(`Lectura del lead falló: ${error.message}`)
    if (!lead) throw new Error(`El site ${siteId} apunta a un lead inexistente.`)

    const { data: brand } = await supabase
      .from("lead_brand")
      .select("short_name, logo_path, icon_path")
      .eq("lead_id", site.lead_id)
      .maybeSingle()

    const brief = (site.brief ?? {}) as {
      themeMode?: "light" | "dark" | "both"
      contactForm?: boolean
      whatsappFloat?: boolean
      locales?: string[]
    }
    const locales = brief.locales?.length ? brief.locales : ["es"]

    // ── business: SOLO los campos inequívocos (los ambiguos van a `todo`) ──
    const maps =
      lead.maps_uri || lead.place_id
        ? {
            ...(cleanMapsUri(lead.maps_uri) ? { uri: cleanMapsUri(lead.maps_uri) } : {}),
            ...(lead.place_id ? { placeId: lead.place_id } : {}),
            ...(typeof lead.rating === "number" ? { rating: lead.rating } : {}),
            ...(typeof lead.reviews_count === "number"
              ? { reviewsCount: lead.reviews_count }
              : {}),
          }
        : undefined

    const business: Record<string, unknown> = {
      name: lead.name,
      ...(brand?.short_name ? { shortName: brand.short_name } : {}),
      ...(lead.phone ? { phone: lead.phone } : {}),
      ...(lead.email ? { email: lead.email } : {}),
      ...(maps && Object.keys(maps).length > 0 ? { maps } : {}),
      // fetch_brand_assets descarga SIEMPRE a estas rutas fijas en fase build.
      ...(brand?.logo_path ? { logo: "/images/logo.png" } : {}),
      ...(brand?.icon_path ? { icon: "/images/icon.png" } : {}),
    }

    const flags = {
      contactForm: brief.contactForm ?? true,
      whatsappFloat: brief.whatsappFloat ?? false,
      multiLang: locales.length > 1,
      themeToggle: brief.themeMode === "both",
    }

    const domain = toDomain(lead.website)

    // Lo que el modelo SÍ debe componer (código no puede sin criterio/dato).
    const todo = [
      `business.address: parsea "${lead.address ?? "(sin dirección)"}" a {street, colonia, city, state, zip(5 díg)}`,
      `business.geo {lat, lng}: coordenadas de ${lead.city ?? "la ciudad"} (no vienen en el lead)`,
      `business.category: legible del giro (lead.category="${lead.category ?? ""}", business_type="${lead.business_type ?? ""}")`,
      "business.whatsapp: SOLO si tienes el número real (no asumas que es el teléfono)",
      "business.hours / founded / social: si hay dato real; si no, omítelos",
      "seo.title / seo.description / seo.keywords: copy con ciudad + servicio",
      "design (concept, palette light+dark, radius, fonts), sections[] con `why`, pages[]",
    ]

    return {
      business,
      flags,
      seo: domain ? { domain } : {},
      locales,
      hints: {
        addressRaw: lead.address ?? null,
        city: lead.city ?? null,
        website: lead.website ?? null,
        hasBrand: Boolean(brand),
      },
      todo,
      hint: "Copia `business`, `flags` y `seo.domain` VERBATIM al spec (ya vienen con el maps/logo/icon correctos — la fuente #1 de mis-serialización). Completa lo de `todo` con tu criterio. Luego pasa el spec COMPLETO a save_site_version.",
    }
  },
})
