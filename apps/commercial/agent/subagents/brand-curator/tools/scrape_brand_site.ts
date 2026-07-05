import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_RE = /(?:\+?52\s?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}/g
const SOCIAL_RE =
  /https?:\/\/(?:www\.)?(?:facebook|instagram|tiktok|linkedin|x|twitter|youtube)\.com\/[^\s"'<>)]+|https?:\/\/wa\.me\/[^\s"'<>)]+/gi

function absolutize(src: string, base: string): string | null {
  try {
    if (src.startsWith("data:")) return null
    return new URL(src, base).toString()
  } catch {
    return null
  }
}

export default defineTool({
  description:
    "Modo buitre: dado un sitio web, extrae TODOS los assets aprovechables de la página — imágenes de <img>, srcset/lazy-load, background-image de CSS, preload, poster de video y og/twitter:image (las descarga al inbox de marca en Storage), los ICONOS del <head> (favicon/apple-touch-icon/manifest → candidatos a isotipo), metadatos (title, description, og:site_name, theme-color = color de marca), emails, teléfonos, redes sociales, documentos descargables (brochure/catálogo PDF en `documents`), y el mapa del sitio COMPLETO (`sitemapUrls` del sitemap.xml + `internalLinks`) para crawlear todas las páginas. Una llamada por página: recórrelas todas para no dejar assets fuera.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    url: z.string().url(),
    maxImages: z.number().int().min(0).max(40).default(20),
  }),
  async execute({ leadId, url, maxImages }) {
    // Soft-result: una página que responde 403/500/login NO debe tumbar el
    // modo buitre en su primer paso. Se devuelve {ok:false} para que el
    // curador pivote (otra página del negocio, web_fetch, screenshots) en vez
    // de morir. Timeout para que un host colgado no congele el turno durable.
    let res: Response
    try {
      res = await fetch(url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(8000),
      })
    } catch (err) {
      return {
        ok: false as const,
        status: 0,
        hint: `No se pudo conectar con ${url} (${err instanceof Error ? err.message : "timeout/red"}). Prueba otra página del negocio (contacto/nosotros), o continúa con los datos del lead sin el scrape.`,
      }
    }
    if (!res.ok) {
      return {
        ok: false as const,
        status: res.status,
        hint: `La página respondió ${res.status} (bloqueo de bots, login o caída). No es un error técnico: prueba un internalLink del negocio, o si ya escarbaste sus otras páginas, continúa armando la ficha con lo que tengas — no te detengas por esto.`,
      }
    }
    const html = await res.text()

    // ——— Texto plano de contacto ———
    const emails = Array.from(
      new Set(
        (html.match(EMAIL_RE) ?? []).filter(
          (e) => !/\.(png|jpe?g|svg|webp|gif|css|js)$/i.test(e),
        ),
      ),
    ).slice(0, 10)
    const socials = Array.from(new Set(html.match(SOCIAL_RE) ?? [])).slice(0, 10)
    // Teléfonos solo de contexto tel: (el regex suelto da falsos positivos).
    const phones = Array.from(
      new Set(
        (html.match(/href=["']tel:([^"']+)["']/gi) ?? []).map((m) =>
          m.replace(/href=["']tel:|["']/gi, ""),
        ),
      ),
    ).slice(0, 5)
    const loosePhones = Array.from(new Set(html.match(PHONE_RE) ?? [])).slice(0, 8)

    // ——— Metadatos del <head>: identidad servida en bandeja ———
    const headMeta = {
      title:
        /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim() ?? null,
      description:
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(
          html,
        )?.[1] ?? null,
      siteName:
        /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(
          html,
        )?.[1] ?? null,
      // theme-color es literalmente el color de marca declarado por el sitio.
      themeColor:
        /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i.exec(
          html,
        )?.[1] ?? null,
    }

    // ——— Iconos del <head>: favicon, apple-touch-icon, mask-icon, manifest ———
    const iconCandidates = new Map<string, string>() // url → rel
    let manifestUrl: string | null = null
    for (const m of html.matchAll(/<link[^>]+>/gi)) {
      const tag = m[0]
      const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? ""
      const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]
      if (!href) continue
      if (rel === "manifest") {
        manifestUrl = absolutize(href, url)
      } else if (
        /(^|\s)(icon|shortcut icon|apple-touch-icon(-precomposed)?|mask-icon)($|\s)/.test(
          rel,
        )
      ) {
        const abs = absolutize(href, url)
        if (abs) iconCandidates.set(abs, rel)
      }
    }
    if (manifestUrl) {
      try {
        const manifestRes = await fetch(manifestUrl, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
        })
        if (manifestRes.ok) {
          const manifest = (await manifestRes.json()) as {
            icons?: Array<{ src?: string; sizes?: string }>
          }
          for (const icon of manifest.icons ?? []) {
            if (!icon.src) continue
            const abs = absolutize(icon.src, manifestUrl)
            if (abs) iconCandidates.set(abs, `manifest ${icon.sizes ?? ""}`)
          }
        }
      } catch {
        // manifest roto: seguir sin él
      }
    }
    // Fallback clásico: /favicon.ico existe aunque el head no lo declare.
    if (iconCandidates.size === 0) {
      iconCandidates.set(new URL("/favicon.ico", url).toString(), "favicon")
    }

    // ——— Imágenes: TODOS los assets visuales de la página, no solo <img> ———
    // Cubre <img src>, srcset (img/source — lazy-load y responsive viven aquí),
    // background-image de CSS inline y de <style>, <link rel=preload as=image>
    // / image_src, <video poster>, y og:image/twitter:image.
    const candidates = new Set<string>()
    const addAbs = (raw: string | undefined) => {
      if (!raw) return
      const abs = absolutize(raw.trim(), url)
      if (abs) candidates.add(abs)
    }
    // <img src>
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) addAbs(m[1])
    // srcset de <img> y <source> (responsive/lazy): "url 1x, url2 2x, url3 640w"
    for (const m of html.matchAll(/<(?:img|source)[^>]+srcset=["']([^"']+)["']/gi)) {
      for (const part of m[1].split(",")) addAbs(part.trim().split(/\s+/)[0])
    }
    // data-src / data-srcset (lazy-load libraries)
    for (const m of html.matchAll(/\sdata-(?:src|lazy-src|original)=["']([^"']+)["']/gi)) addAbs(m[1])
    // background-image: url(...) — inline style y bloques <style>
    for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\((['"]?)([^'")]+)\1\)/gi)) addAbs(m[2])
    // <link rel="preload" as="image" href> y <link rel="image_src" href>
    for (const m of html.matchAll(/<link[^>]+>/gi)) {
      const tag = m[0]
      const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? ""
      const as = /\bas=["']image["']/i.test(tag)
      if ((rel.includes("preload") && as) || rel.includes("image_src")) {
        addAbs(/href=["']([^"']+)["']/i.exec(tag)?.[1])
      }
    }
    // <video poster>
    for (const m of html.matchAll(/<video[^>]+poster=["']([^"']+)["']/gi)) addAbs(m[1])
    // og:image / twitter:image (property u name, en cualquier orden de atributos)
    for (const m of html.matchAll(
      /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/gi,
    )) addAbs(m[1])
    for (const m of html.matchAll(
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/gi,
    )) addAbs(m[1])

    const supabase = getSupabaseClient()
    const supabaseUrl = process.env.SUPABASE_URL ?? ""

    // Iconos: se descargan aparte, SIN mínimo de peso (un favicon pesa KBs) —
    // son los candidatos naturales a isotipo (business.icon del sitio).
    const icons: Array<{
      source: string
      rel: string
      path: string
      url: string
      bytes: number
    }> = []
    let iconIdx = 0
    for (const [iconUrl, rel] of iconCandidates) {
      if (icons.length >= 6) break
      try {
        const iconRes = await fetch(iconUrl, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
        })
        const type = iconRes.headers.get("content-type") ?? ""
        if (!iconRes.ok) continue
        if (!type.startsWith("image/") && !iconUrl.endsWith(".ico")) continue
        const bytes = new Uint8Array(await iconRes.arrayBuffer())
        if (bytes.byteLength < 100 || bytes.byteLength > 2 * 1024 * 1024)
          continue
        const ext = type.includes("svg")
          ? "svg"
          : type.includes("png")
            ? "png"
            : type.includes("webp")
              ? "webp"
              : type.includes("icon") || iconUrl.endsWith(".ico")
                ? "ico"
                : "png"
        iconIdx += 1
        const relSlug = rel.replace(/[^a-z0-9-]+/gi, "-").slice(0, 30)
        const path = `${leadId}/inbox/icon-${iconIdx}-${relSlug}.${ext}`
        const { error } = await supabase.storage
          .from("brand-assets")
          .upload(path, bytes, {
            contentType: type || "image/x-icon",
            upsert: true,
          })
        if (error) continue
        icons.push({
          source: iconUrl,
          rel,
          path,
          url: `${supabaseUrl}/storage/v1/object/public/brand-assets/${path}`,
          bytes: bytes.byteLength,
        })
      } catch {
        continue
      }
    }

    const stored: Array<{ source: string; path: string; url: string }> = []
    for (const imgUrl of candidates) {
      if (stored.length >= maxImages) break
      try {
        const imgRes = await fetch(imgUrl, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
        })
        const type = imgRes.headers.get("content-type") ?? ""
        if (!imgRes.ok || !type.startsWith("image/")) continue
        const bytes = new Uint8Array(await imgRes.arrayBuffer())
        // Fuera iconitos y tracking pixels; fuera gigantes.
        if (bytes.byteLength < 12 * 1024 || bytes.byteLength > 8 * 1024 * 1024)
          continue
        const ext = type.includes("svg")
          ? "svg"
          : type.includes("webp")
            ? "webp"
            : type.includes("png")
              ? "png"
              : "jpg"
        const name = `${Date.now()}-${stored.length}-scrape.${ext}`
        const path = `${leadId}/inbox/${name}`
        const { error } = await supabase.storage
          .from("brand-assets")
          .upload(path, bytes, { contentType: type })
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

    // ——— Links internos y documentos: mapa del sitio para seguir escarbando ———
    const host = new URL(url).host
    const origin = new URL(url).origin
    const sameHost = (h: string): boolean => {
      try {
        return new URL(h).host === host
      } catch {
        return false
      }
    }
    const allLinks = Array.from(
      new Set(
        Array.from(html.matchAll(/<a[^>]+href=["']([^"'#][^"']*)["']/gi))
          .map((m) => absolutize(m[1], url))
          .filter((h): h is string => Boolean(h) && sameHost(h!)),
      ),
    )
    // Documentos de marca (brochures, catálogos, fichas técnicas): no se
    // descargan al bucket, se listan para que el curador los pase/note.
    const docRe = /\.(pdf|docx?|pptx?|xlsx?)($|\?)/i
    const documents = allLinks.filter((h) => docRe.test(h)).slice(0, 12)
    // Páginas internas para crawlear: todo link de página (no documento, no
    // asset), con las de más botín primero. Tope alto — el curador decide
    // cuáles seguir; antes se cortaba a 6 y solo a contacto/nosotros.
    const highValue =
      /contact|nosotros|about|quienes|empresa|menu|carta|servicio|producto|catalog|equipo|galer|portafolio|proyecto|flota|cobertura|marca|blog|noticia/i
    const pageLinks = allLinks.filter(
      (h) => !docRe.test(h) && !/\.(jpe?g|png|webp|gif|svg|mp4|zip)($|\?)/i.test(h),
    )
    const internalLinks = [
      ...pageLinks.filter((h) => highValue.test(h)),
      ...pageLinks.filter((h) => !highValue.test(h)),
    ].slice(0, 20)

    // sitemap.xml: el índice COMPLETO de páginas del sitio (mejor que adivinar
    // por links del home). Best-effort; muchos sitios lo publican.
    let sitemapUrls: string[] = []
    for (const sm of [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]) {
      try {
        const smRes = await fetch(sm, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
        })
        if (!smRes.ok) continue
        const xml = await smRes.text()
        sitemapUrls = Array.from(
          new Set(
            Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi))
              .map((m) => m[1])
              .filter((h) => sameHost(h) && !/\.xml($|\?)/i.test(h)),
          ),
        ).slice(0, 50)
        if (sitemapUrls.length > 0) break
      } catch {
        // sin sitemap: seguimos con los links del home
      }
    }

    return {
      ok: true as const,
      meta: headMeta,
      icons,
      documents,
      sitemapUrls,
      images: stored,
      imagesFound: candidates.size,
      emails,
      phones: phones.length > 0 ? phones : loosePhones,
      socials,
      internalLinks,
      hint: [
        icons.length > 0
          ? "`icons` son los candidatos a isotipo: prefiere SVG o el PNG más grande (apple-touch/manifest); el .ico solo como último recurso. Promuévelo con save_brand_profile.iconSourcePath."
          : null,
        headMeta.themeColor
          ? `theme-color declarado por el sitio: ${headMeta.themeColor} — candidato directo a color de marca.`
          : null,
        stored.length > 0
          ? "Analiza las imágenes descargadas con analyze_brand_image y decide cuáles promover; guarda contactos con update_lead_info."
          : "Sin imágenes útiles en esta página; prueba un internalLink (galería/nosotros).",
        sitemapUrls.length > 0
          ? `sitemapUrls trae ${sitemapUrls.length} página(s) del sitio COMPLETO: recórrelas con scrape_brand_site para no dejar assets fuera (no te quedes solo en el home).`
          : internalLinks.length > 0
            ? `Sin sitemap; internalLinks trae ${internalLinks.length} página(s) — crawléalas para juntar TODOS los assets del sitio.`
            : null,
        documents.length > 0
          ? `documents: ${documents.length} archivo(s) descargable(s) (brochure/catálogo/ficha) — anótalos en las notas del lead con update_lead_info; son material de venta.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    }
  },
})
