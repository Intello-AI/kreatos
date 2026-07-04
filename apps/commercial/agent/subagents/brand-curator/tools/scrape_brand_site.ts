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
    "Modo buitre: dado un sitio web, extrae TODO lo aprovechable — imágenes (las descarga al inbox de marca en Storage), los ICONOS del <head> (favicon/apple-touch-icon/manifest → candidatos a isotipo), metadatos (title, description, og:site_name, theme-color = color de marca), emails, teléfonos, redes sociales y links internos (contacto/nosotros) para seguir escarbando. Una llamada por página.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    url: z.string().url(),
    maxImages: z.number().int().min(0).max(20).default(10),
  }),
  async execute({ leadId, url, maxImages }) {
    const res = await fetch(url, { headers: { "user-agent": UA } })
    if (!res.ok) {
      throw new Error(`La página respondió ${res.status}; no se pudo escrapear.`)
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

    // ——— Imágenes: <img src/srcset> + og:image ———
    const candidates = new Set<string>()
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      const abs = absolutize(m[1], url)
      if (abs) candidates.add(abs)
    }
    for (const m of html.matchAll(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    )) {
      const abs = absolutize(m[1], url)
      if (abs) candidates.add(abs)
    }

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
        const iconRes = await fetch(iconUrl, { headers: { "user-agent": UA } })
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
        const imgRes = await fetch(imgUrl, { headers: { "user-agent": UA } })
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

    // ——— Links internos útiles para seguir escarbando ———
    const host = new URL(url).host
    const internalLinks = Array.from(
      new Set(
        Array.from(html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi))
          .map((m) => absolutize(m[1], url))
          .filter((h): h is string => Boolean(h))
          .filter((h) => {
            try {
              return (
                new URL(h).host === host &&
                /contact|nosotros|about|menu|carta|servicio|equipo|galer/i.test(h)
              )
            } catch {
              return false
            }
          }),
      ),
    ).slice(0, 6)

    return {
      meta: headMeta,
      icons,
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
      ]
        .filter(Boolean)
        .join(" "),
    }
  },
})
