import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"
import { toolModel, toolModelLabel } from "../../../lib/tool-models"
import { recordToolUsage } from "../../../lib/tool-usage"

/**
 * Describe la ESTRUCTURA del sitio web ACTUAL del lead — páginas y secciones
 * en orden, qué cuenta cada una — y la guarda en lead_brand.site_structure.
 * El art-director la recibe vía get_site_brief y la usa como referencia de
 * COMPOSICIÓN del negocio real: qué narra hoy, en qué orden, qué secciones
 * son irrenunciables (menú/servicios/equipo), sin re-visitar el sitio.
 *
 * Determinista primero (esqueleto de headings/landmarks del HTML), y un modelo
 * barato (router `summarize`) lo condensa a JSON estructurado. NO copia el
 * diseño: describe el CONTENIDO y su orden — la composición nueva la decide
 * el art-director.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

/** HTML → esqueleto legible: headings en orden + texto plano condensado. */
function skeleton(html: string): string {
  // Fuera scripts/estilos/SVG/comentarios (ruido sin contenido).
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " [svg] ")
    .replace(/<!--[\s\S]*?-->/g, " ")
  // Marca headings y landmarks ANTES de despojar tags, para conservar el orden
  // estructural en el texto plano.
  clean = clean
    .replace(/<h([1-3])[^>]*>/gi, "\n\n[H$1] ")
    .replace(/<\/h[1-3]>/gi, "\n")
    // Marcador SIN "<>" — con ángulos, el strip de tags de abajo se lo comía.
    .replace(/<(header|nav|footer|section|article|main|aside)[^>]*>/gi, "\n[sec:$1]\n")
    .replace(/<img[^>]*alt=["']([^"']{3,80})["'][^>]*>/gi, " [img: $1] ")
    .replace(/<img[^>]*>/gi, " [img] ")
    .replace(/<(?:a|button)[^>]*(?:class=["'][^"']*(?:btn|button|cta)[^"']*["'])[^>]*>([^<]{2,60})</gi, " [cta: $1] <")
  // Despoja el resto de tags y compacta: fuera líneas vacías (el HTML real
  // deja cientos — puro token quemado).
  const text = clean
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
  return text.slice(0, 14_000)
}

function stripFences(text: string): string {
  const t = text.trim()
  const m = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(t)
  return m ? m[1] : t
}

export default defineTool({
  description:
    "Describe la ESTRUCTURA del sitio web ACTUAL del lead (páginas → secciones en orden → qué cuenta cada una) y la GUARDA en lead_brand.site_structure — el art-director la recibe en el brief y la usa como referencia de composición (qué narra el negocio hoy, qué secciones existen, qué no puede faltar). Pásale el home + hasta 3 páginas clave (de sitemapUrls/internalLinks de scrape_brand_site). Úsalo SIEMPRE que el lead tenga sitio web, después del scrape. No copia el diseño: describe contenido y orden.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    urls: z
      .array(z.string().url())
      .min(1)
      .max(4)
      .describe(
        "Home primero + hasta 3 páginas clave (servicios/nosotros/menú). Más páginas no aportan composición.",
      ),
  }),
  async execute({ leadId, urls }, ctx) {
    // ── 1. Esqueletos por página (determinista) ────────────────────────────
    const pages: Array<{ url: string; skeleton: string }> = []
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) continue
        pages.push({ url, skeleton: skeleton(await res.text()) })
      } catch {
        continue
      }
    }
    if (pages.length === 0) {
      return {
        ok: false as const,
        hint: "Ninguna URL respondió. Verifica el sitio del lead o continúa sin estructura (el art-director compone desde cero).",
      }
    }

    // ── 2. Condensar a JSON con el modelo barato del router ───────────────
    const prompt = `Analiza el esqueleto de texto de ${pages.length} página(s) del sitio web REAL de un negocio (marcadores: [H1]/[H2]/[H3] = headings, [<header>]/[<nav>]/[<section>]/[<footer>] = landmarks, [img: alt] = imágenes, [cta: texto] = botones).

Devuelve SOLO este JSON (sin markdown, sin comentarios):
{
  "pages": [
    {
      "url": "<url>",
      "title": "<título/propósito de la página en 3-8 palabras>",
      "sections": [
        {
          "heading": "<heading o tema de la sección>",
          "kind": "<hero|servicios|nosotros|equipo|galeria|testimonios|faq|contacto|menu|productos|cta|footer|otro>",
          "summary": "<qué cuenta/muestra esta sección, 1 frase concreta>"
        }
      ]
    }
  ],
  "composition": "<2-4 frases: cómo se organiza el sitio HOY — orden narrativo, qué pesa más (servicios/productos/equipo), qué secciones son claramente irrenunciables para este negocio, y qué contenido único tiene (menús, catálogos, certificaciones, sucursales)>"
}

Reglas: describe el CONTENIDO real, no el diseño; secciones en el ORDEN en que aparecen; ignora cookie banners, popups y widgets de chat; máximo 10 secciones por página.

${pages.map((p) => `===== PÁGINA: ${p.url} =====\n${p.skeleton}`).join("\n\n")}`

    const model = toolModel("summarize")
    const res = await generateText({ model, prompt })
    await recordToolUsage(ctx, "brand-curator", toolModelLabel("summarize"), res.usage)

    let structure: {
      pages?: Array<{
        url?: string
        title?: string
        sections?: Array<{ heading?: string; kind?: string; summary?: string }>
      }>
      composition?: string
    }
    try {
      structure = JSON.parse(stripFences(res.text))
    } catch {
      return {
        ok: false as const,
        hint: "El resumen no devolvió JSON válido. Reintenta la llamada; si persiste, guarda tus observaciones en las notas del lead (update_lead_info).",
      }
    }
    if (!Array.isArray(structure.pages) || structure.pages.length === 0) {
      return {
        ok: false as const,
        hint: "El resumen no trajo páginas. Reintenta con menos URLs o continúa sin estructura.",
      }
    }

    // ── 3. Guardar en lead_brand (merge: solo esta columna) ───────────────
    const payload = {
      sourceUrl: urls[0],
      describedAt: new Date().toISOString(),
      pages: structure.pages,
      composition: structure.composition ?? "",
    }
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from("lead_brand")
      .upsert(
        { lead_id: leadId, site_structure: payload as never },
        { onConflict: "lead_id" },
      )
    if (error) {
      throw new Error(`No se pudo guardar site_structure: ${error.message}`)
    }

    const sectionCount = structure.pages.reduce(
      (n, p) => n + (p.sections?.length ?? 0),
      0,
    )
    return {
      ok: true as const,
      pagesDescribed: structure.pages.map((p) => p.url),
      sections: sectionCount,
      composition: structure.composition ?? "",
      hint: "Estructura guardada en lead_brand.site_structure — el art-director la recibe en el brief como referencia de composición del negocio real. Nada más que hacer aquí.",
    }
  },
})
