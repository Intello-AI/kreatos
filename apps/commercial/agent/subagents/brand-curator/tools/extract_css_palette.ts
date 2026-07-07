import { defineTool } from "eve/tools"
import { z } from "zod"

/**
 * Paleta DURA desde el CSS del sitio (no adivinada por visión): baja los
 * stylesheets enlazados + los <style> inline, extrae los colores por FRECUENCIA
 * y los CUSTOM PROPS (`--primary`, `--brand`, `--accent`…) que son el color
 * DECLARADO por la marca. Complementa `analyze_brand_image` (visión) con datos
 * exactos. Cero modelo.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

/** #rgb/#rrggbb/#rrggbbaa → #rrggbb (minúsculas), o null si no parsea. */
function normHex(h: string): string | null {
  let s = h.replace("#", "").toLowerCase()
  if (s.length === 3) s = s.replace(/./g, (c) => c + c)
  if (s.length === 8) s = s.slice(0, 6) // descarta alpha
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null
}

/** rgb(r,g,b)/rgba(...) → #rrggbb. */
function rgbToHex(inner: string): string | null {
  const parts = inner.split(",").map((p) => p.trim())
  if (parts.length < 3) return null
  const toByte = (p: string): number | null => {
    if (p.endsWith("%")) {
      const n = parseFloat(p)
      return isNaN(n) ? null : Math.round((n / 100) * 255)
    }
    const n = parseInt(p, 10)
    return isNaN(n) ? null : Math.max(0, Math.min(255, n))
  }
  const [r, g, b] = [toByte(parts[0]), toByte(parts[1]), toByte(parts[2])]
  if (r === null || g === null || b === null) return null
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

/** Colores achromáticos (gris/blanco/negro) — chrome, no acento de marca. */
function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min < 12 // casi sin saturación
}

export default defineTool({
  description:
    "Extrae la paleta REAL de un sitio desde su CSS (stylesheets enlazados + <style> inline): colores por frecuencia y los custom props de color (--primary/--brand/--accent…), que son el color DECLARADO por la marca. Datos duros que complementan analyze_brand_image (visión). Devuelve topColors (hex por frecuencia, con los acentos separados de los neutros) y namedTokens (custom props). Úsalo en un rediseño para no adivinar la paleta.",
  inputSchema: z.object({
    url: z.string().url().describe("URL del sitio de la marca."),
  }),
  async execute({ url }) {
    let html: string
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        return {
          ok: false as const,
          status: res.status,
          hint: `La página respondió ${res.status}. Prueba otra URL del negocio o usa analyze_brand_image sobre un screenshot.`,
        }
      }
      html = await res.text()
    } catch (err) {
      return {
        ok: false as const,
        status: 0,
        hint: `No se pudo conectar con ${url} (${err instanceof Error ? err.message : "timeout"}).`,
      }
    }

    const origin = new URL(url)
    // <style> inline + hrefs de <link rel="stylesheet">.
    let css = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
      .map((m) => m[1])
      .join("\n")
    const sheetHrefs = Array.from(
      html.matchAll(
        /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi,
      ),
    )
      .map((m) => m[1] ?? m[2])
      .filter(Boolean)
      .slice(0, 8) // cap: los primeros stylesheets llevan el theme

    for (const href of sheetHrefs) {
      try {
        const abs = new URL(href, origin).toString()
        const r = await fetch(abs, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
        })
        if (!r.ok) continue
        css += "\n" + (await r.text()).slice(0, 500_000)
      } catch {
        continue
      }
    }

    // Custom props de color: la señal MÁS fuerte (color con nombre de la marca).
    const namedTokens: { name: string; value: string; hex: string | null }[] = []
    const seenNames = new Set<string>()
    for (const m of css.matchAll(
      /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\))/g,
    )) {
      const name = m[1].toLowerCase()
      if (seenNames.has(name)) continue
      seenNames.add(name)
      const raw = m[2].trim()
      const hex = raw.startsWith("#")
        ? normHex(raw)
        : raw.startsWith("rgb")
          ? rgbToHex(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")")))
          : null
      namedTokens.push({ name, value: raw, hex })
      if (namedTokens.length >= 40) break
    }

    // Frecuencia de colores literales (hex + rgb).
    const freq = new Map<string, number>()
    const bump = (hex: string | null) => {
      if (hex) freq.set(hex, (freq.get(hex) ?? 0) + 1)
    }
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) bump(normHex(m[0]))
    for (const m of css.matchAll(/rgba?\(([^)]+)\)/g)) bump(rgbToHex(m[1]))

    const ranked = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([hex, count]) => ({ hex, count }))
    const accents = ranked.filter((c) => !isNeutral(c.hex)).slice(0, 10)
    const neutrals = ranked.filter((c) => isNeutral(c.hex)).slice(0, 6)

    return {
      ok: true as const,
      // Los custom props nombrados son el color de marca DECLARADO — míralos primero.
      namedTokens: namedTokens.filter((t) => t.hex || /color|brand|primary|accent|bg|background|fg|foreground|text|border|surface/i.test(t.name)),
      accents,
      neutrals,
      colorsFound: freq.size,
      hint: "namedTokens (--primary/--brand/--accent con hex) mandan sobre `accents` por frecuencia. Elige el PROTAGONISTA de marca como primary (no el gris más frecuente). Cruza con theme-color de scrape_brand_site y guarda los hex en save_brand_profile.colors (dominante primero).",
    }
  },
})
