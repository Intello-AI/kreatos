/**
 * Evaluación DETERMINISTA de la calidad de un sitio web, para priorizar leads:
 * el mejor cliente es el que NO tiene web o la tiene fea/vieja (venta de sitio
 * nuevo o rediseño). Sin adivinar: se fetchea el HTML y se puntúa por señales
 * objetivas (responsive, https, año de copyright, builder anticuado, etc.).
 *
 * Veredictos (de mejor lead a peor lead para vender): "none" (sin web) →
 * "broken" (no carga / dominio parkeado) → "outdated" → "weak" → "decent"
 * (web moderna, venta difícil) → "unknown" (bloqueó el fetch, no se pudo juzgar).
 */

export type WebsiteVerdict =
  | "none"
  | "broken"
  | "outdated"
  | "weak"
  | "decent"
  | "unknown"

export interface WebsiteAssessment {
  verdict: WebsiteVerdict
  /** 0-100 (mayor = mejor sitio); null si no se pudo juzgar. */
  score: number | null
  /** Señales legibles en español (para explicar el veredicto en el dashboard). */
  signals: string[]
}

const CURRENT_YEAR = 2026
const FETCH_TIMEOUT_MS = 9000
const MAX_HTML_BYTES = 250_000

/** Sin sitio: el mejor lead (sitio nuevo). No hay nada que fetchear. */
export const NO_WEBSITE: WebsiteAssessment = {
  verdict: "none",
  score: null,
  signals: [],
}

export async function assessWebsite(url: string): Promise<WebsiteAssessment> {
  let res: Response
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // UA de navegador real: muchos sitios viejos responden distinto a bots.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    })
  } catch {
    clearTimeout(timeout)
    return { verdict: "broken", signals: ["no carga (timeout o error de red)"], score: 0 }
  }
  clearTimeout(timeout)

  const finalUrl = res.url || url
  // 403/429/401: probablemente un WAF/anti-bot de un sitio que SÍ existe — no
  // se puede juzgar sin falsear; se marca unknown (prioridad media).
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    return { verdict: "unknown", signals: [`bloqueó el análisis (HTTP ${res.status})`], score: null }
  }
  if (!res.ok) {
    return { verdict: "broken", signals: [`no carga (HTTP ${res.status})`], score: 0 }
  }

  let html = ""
  try {
    const buf = await res.arrayBuffer()
    html = new TextDecoder("utf-8", { fatal: false }).decode(
      buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf,
    )
  } catch {
    return { verdict: "unknown", signals: ["respuesta ilegible"], score: null }
  }

  const lower = html.toLowerCase()
  const signals: string[] = []
  let score = 100

  // Dominio parkeado / en venta: no es un negocio con web, es un placeholder.
  const parked =
    /this domain (is|may be) for sale|buy this domain|domain( name)? for sale|dominio (en venta|a la venta)|sedoparking|parkingcrew|godaddy\.com\/domains|hugedomains/.test(
      lower,
    )
  if (parked || html.trim().length < 400) {
    return {
      verdict: "broken",
      signals: [parked ? "dominio parkeado / en venta" : "página prácticamente vacía"],
      score: 0,
    }
  }

  // HTTPS.
  if (!finalUrl.startsWith("https://")) {
    signals.push("sin HTTPS")
    score -= 25
  }
  // Responsive: el delator #1 de sitio viejo.
  if (!/<meta[^>]+name=["']?viewport["']?/i.test(html)) {
    signals.push("sin <meta viewport> (no responsive)")
    score -= 35
  }
  // Builder / stack anticuado o Flash.
  if (/\.swf(["'?]|$)|application\/x-shockwave-flash/i.test(html)) {
    signals.push("usa Flash (obsoleto)")
    score -= 30
  }
  if (/frontpage|joomla!? 1\.|xt:commerce|<!--\s*wix/i.test(lower) || /godaddy website builder|websitebuilder/i.test(lower)) {
    signals.push("builder/CMS anticuado")
    score -= 20
  }
  // Maquetación con etiquetas muertas.
  const layoutTags = (html.match(/<(font|center|marquee)\b/gi) ?? []).length
  const tableCount = (html.match(/<table\b/gi) ?? []).length
  if (layoutTags > 0) {
    signals.push("etiquetas obsoletas (<font>/<center>/<marquee>)")
    score -= 15
  }
  if (tableCount >= 3) {
    signals.push("posible maquetación con <table>")
    score -= 10
  }
  // Año de copyright viejo.
  const years = [...lower.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,20}(20\d{2})/g)].map(
    (m) => parseInt(m[1], 10),
  )
  const newestYear = years.length ? Math.max(...years) : null
  if (newestYear !== null && newestYear <= CURRENT_YEAR - 3) {
    signals.push(`copyright viejo (${newestYear})`)
    score -= 15
  }
  // Señales de sitio moderno (no penalizan, pero su ausencia sí resta un poco).
  if (!/<meta[^>]+property=["']og:/i.test(html)) {
    signals.push("sin Open Graph")
    score -= 8
  }
  if (!/<link[^>]+rel=["'][^"']*icon/i.test(html)) {
    signals.push("sin favicon")
    score -= 5
  }
  if (!/<title[^>]*>[^<]{2,}<\/title>/i.test(html)) {
    signals.push("sin <title>")
    score -= 10
  }

  score = Math.max(0, Math.min(100, score))

  let verdict: WebsiteVerdict
  if (score < 35) verdict = "outdated"
  else if (score < 62) verdict = "weak"
  else verdict = "decent"

  return { verdict, score, signals }
}
