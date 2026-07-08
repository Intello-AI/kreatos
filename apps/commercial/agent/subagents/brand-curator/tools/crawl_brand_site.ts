import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

/**
 * Crawl COMPLETO del sitio: recorre varias páginas (sitemap + links internos),
 * junta TODAS las imágenes de todas ellas en una sola pasada y las descarga al
 * inbox deduplicadas por URL. `scrape_brand_site` es una sola página; esto
 * automatiza el "recórrelas todas" para no dejar assets fuera. Filtra por tamaño
 * (>12KB) para botar íconos/tracking pixels.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

function absolutize(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

/** Candidatos de imagen de una página (img/srcset/lazy/bg/og). */
function collectImages(html: string, pageUrl: string): Set<string> {
  const out = new Set<string>()
  const add = (raw?: string) => {
    if (!raw) return
    const abs = absolutize(raw.trim(), pageUrl)
    if (abs) out.add(abs)
  }
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) add(m[1])
  for (const m of html.matchAll(/<(?:img|source)[^>]+srcset=["']([^"']+)["']/gi))
    for (const part of m[1].split(",")) add(part.trim().split(/\s+/)[0])
  for (const m of html.matchAll(
    /\sdata-(?:src|lazy-src|original)=["']([^"']+)["']/gi,
  ))
    add(m[1])
  for (const m of html.matchAll(
    /background(?:-image)?\s*:\s*url\((['"]?)([^'")]+)\1\)/gi,
  ))
    add(m[2])
  for (const m of html.matchAll(
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi,
  ))
    add(m[1])
  return out
}

/** Links internos de una página, priorizando las de alto valor de marca. */
function collectLinks(html: string, pageUrl: string, host: string): string[] {
  const links = new Set<string>()
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    const abs = absolutize(m[1], pageUrl)
    if (
      abs &&
      new URL(abs).host === host &&
      !/\.(jpe?g|png|webp|gif|svg|mp4|zip|pdf)($|\?)/i.test(abs)
    )
      links.add(abs.split("#")[0])
  }
  return [...links]
}

const HIGH_VALUE =
  /contact|nosotros|about|quienes|empresa|servicio|producto|catalog|equipo|galer|portafolio|proyecto|flota|cobertura|marca|obra/i

export default defineTool({
  description:
    "Crawl COMPLETO del sitio de la marca: recorre hasta maxPages (sitemap + links internos, priorizando nosotros/servicios/proyectos/galería/equipo), junta TODAS las imágenes de todas las páginas deduplicadas y las descarga al inbox. Automatiza el 'recórrelas todas' de scrape_brand_site en una sola llamada para no dejar assets fuera. Úsalo cuando quieras el barrido total del sitio; scrape_brand_site sigue sirviendo para una página puntual (trae además contactos/docs/fonts/theme-color).",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    url: z.string().url().describe("URL de arranque (normalmente el home)."),
    maxPages: z.number().int().min(1).max(30).default(8),
    maxImages: z.number().int().min(1).max(300).default(80),
  }),
  async execute({ leadId, url, maxPages, maxImages }) {
    const supabase = getSupabaseClient()
    const supabaseUrl = process.env.SUPABASE_URL ?? ""
    const origin = new URL(url)
    const host = origin.host

    const fetchText = async (u: string): Promise<string | null> => {
      try {
        const r = await fetch(u, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
        })
        return r.ok ? await r.text() : null
      } catch {
        return null
      }
    }

    // Páginas a recorrer: sitemap.xml si existe, si no los links del home.
    const home = await fetchText(url)
    if (home === null) {
      return {
        ok: false as const,
        hint: `No se pudo abrir ${url}. Prueba otra URL del negocio.`,
      }
    }
    let pageList: string[] = []
    for (const sm of [`${origin.origin}/sitemap.xml`, `${origin.origin}/sitemap_index.xml`]) {
      const xml = await fetchText(sm)
      if (!xml) continue
      pageList = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi))
        .map((m) => m[1])
        .filter((h) => {
          try {
            return new URL(h).host === host && !/\.xml($|\?)/i.test(h)
          } catch {
            return false
          }
        })
      if (pageList.length > 0) break
    }
    if (pageList.length === 0) {
      const links = collectLinks(home, url, host)
      pageList = [
        ...links.filter((l) => HIGH_VALUE.test(l)),
        ...links.filter((l) => !HIGH_VALUE.test(l)),
      ]
    }
    // El home primero, luego alto-valor, dedup, cap.
    const pages = Array.from(new Set([url, ...pageList])).slice(0, maxPages)

    // Junta candidatos de TODAS las páginas (dedup global por URL de imagen).
    const candidates = new Set<string>()
    for (const [i, page] of pages.entries()) {
      const html = i === 0 ? home : await fetchText(page)
      if (!html) continue
      for (const c of collectImages(html, page)) candidates.add(c)
    }

    // Descarga deduplicada, filtrando por tamaño (fuera íconos/pixels/gigantes).
    const stored: Array<{ source: string; path: string; url: string }> = []
    for (const imgUrl of candidates) {
      if (stored.length >= maxImages) break
      try {
        const r = await fetch(imgUrl, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
        })
        if (!r.ok) continue
        const type = r.headers.get("content-type") ?? ""
        const bytes = new Uint8Array(await r.arrayBuffer())
        // SVG por content-type O extensión + sniff (servers los sirven como
        // text/xml). Los SVG se exentan del piso de 12KB: un logo vectorial
        // pesa 1-10KB y se botaba junto con los tracking pixels.
        const looksSvg =
          type.includes("svg") ||
          (/\.svg($|\?)/i.test(imgUrl) &&
            /^\s*(?:<\?xml|<svg)/i.test(
              new TextDecoder().decode(bytes.slice(0, 200)),
            ))
        if (!type.startsWith("image/") && !looksSvg) continue
        const minBytes = looksSvg ? 300 : 12 * 1024
        if (bytes.byteLength < minBytes || bytes.byteLength > 8 * 1024 * 1024)
          continue
        const ext = looksSvg
          ? "svg"
          : type.includes("webp")
            ? "webp"
            : type.includes("png")
              ? "png"
              : "jpg"
        const path = `${leadId}/inbox/crawl-${stored.length}-${Date.now()}.${ext}`
        const { error } = await supabase.storage
          .from("brand-assets")
          .upload(path, bytes, {
            contentType: looksSvg ? "image/svg+xml" : type,
            upsert: true,
          })
        if (error) continue
        stored.push({
          source: imgUrl,
          path,
          url: `${supabaseUrl}/storage/v1/object/public/brand-assets/${path}`,
        })
      } catch {
        continue
      }
    }

    return {
      ok: true as const,
      pagesVisited: pages,
      images: stored,
      imagesFound: candidates.size,
      hint: `Recorrí ${pages.length} página(s) y descargué ${stored.length} imagen(es) únicas (${candidates.size} candidatas). Analízalas con analyze_brand_image y promueve las buenas con save_brand_profile. Para contactos/docs/fonts/theme-color de una página, usa scrape_brand_site.`,
    }
  },
})
