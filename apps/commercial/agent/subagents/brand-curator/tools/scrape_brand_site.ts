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
    "Modo buitre: dado un sitio web, extrae TODO lo aprovechable — imágenes (las descarga al inbox de marca en Storage), emails, teléfonos, redes sociales y links internos (contacto/nosotros) para seguir escarbando. Una llamada por página.",
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
      images: stored,
      imagesFound: candidates.size,
      emails,
      phones: phones.length > 0 ? phones : loosePhones,
      socials,
      internalLinks,
      hint:
        stored.length > 0
          ? "Analiza las imágenes descargadas con analyze_brand_image y decide cuáles promover; guarda contactos con update_lead_info."
          : "Sin imágenes útiles en esta página; prueba un internalLink (galería/nosotros).",
    }
  },
})
