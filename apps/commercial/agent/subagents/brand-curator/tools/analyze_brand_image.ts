import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

const PROMPT = `Eres un director de arte. Analiza esta imagen de la marca de un negocio local y responde SOLO un JSON válido (sin markdown) con esta forma:
{
  "description": "qué es la imagen, en una frase",
  "isLogoCandidate": true/false,
  "logoScore": 1-5,
  "logoNotes": "por qué sirve o no como logo (fondo, resolución, vectorial vs foto)",
  "isPlaceholder": true/false,
  "placeholderNote": "si isPlaceholder=true, de qué marca/herramienta es (p. ej. 'logo de Canva', 'favicon default de WordPress/Wix/GoDaddy', 'ícono genérico de navegador')",
  "dominantColors": ["#hex en orden de dominancia, máx 6"],
  "tokens": { "background": "#hex", "foreground": "#hex", "primary": "#hex", "muted-foreground": "#hex", "border": "#hex" },
  "siteImageUse": "hero | about | portfolio | none — y por qué en 3-5 palabras",
  "quality": "nítida/borrosa, resolución aparente, observaciones"
}
En "tokens" traduce la paleta al rol funcional (el color protagonista de la marca → primary). Si la imagen es un screenshot de un sitio/red social de la marca, extrae la paleta REAL visible.
CRÍTICO — isPlaceholder: los favicons scrapeados de un sitio a veces NO son la marca del negocio sino el logo de la herramienta con que lo hicieron o un ícono default: la "C" de Canva, el logo de Wix/Squarespace/WordPress/GoDaddy, el ícono genérico de "documento/mundo" del navegador. Si reconoces la imagen como uno de esos (o como un ícono genérico sin relación con el negocio), marca isPlaceholder=true, isLogoCandidate=false, logoScore=1. NUNCA promuevas un placeholder como logo ni isotipo.`

// Ruteo de costo: gpt-5-mini hace el análisis (visión input domina y es ~5x
// más barato que 5.1); se dispara por cada imagen del inbox (3-8 por lead).
// Solo la decisión SENSIBLE a world-knowledge — PROMOVER algo como logo — se
// escala a 5.1: reconocer la "C" de Canva / favicon de Wix como placeholder es
// justo lo que el modelo grande hace mejor, así que 5.1 revisa antes de
// bendecir un logo, y todo lo demás (paleta, fotos que no son logo) se queda en
// mini. Toggle BRAND_VISION_MODEL para experimentar el modelo primario.
const VISION_PRIMARY = process.env.BRAND_VISION_MODEL || "gpt-5-mini"
const VISION_FALLBACK = "gpt-5.1"

export default defineTool({
  description:
    "VE una imagen del inbox de marca (visión multimodal): descripción, si sirve como logo (score), colores dominantes y su traducción a tokens del sistema (como design-scout), y uso sugerido en el sitio.",
  inputSchema: z.object({
    imageUrl: z
      .string()
      .url()
      .describe("URL pública del archivo en el bucket brand-assets."),
    question: z
      .string()
      .optional()
      .describe("Pregunta extra específica sobre la imagen, si la hay."),
  }),
  async execute({ imageUrl, question }) {
    const res = await fetch(imageUrl)
    if (!res.ok) {
      throw new Error(`No se pudo descargar la imagen (${res.status}).`)
    }
    const contentType =
      res.headers.get("content-type") ??
      (imageUrl.endsWith(".svg") ? "image/svg+xml" : "image/png")
    if (!contentType.startsWith("image/") && !imageUrl.endsWith(".svg")) {
      throw new Error(`El archivo no es una imagen (${contentType}).`)
    }

    const isSvg =
      contentType.includes("svg") || imageUrl.toLowerCase().endsWith(".svg")
    const promptText = question ? `${PROMPT}\n\nAdemás: ${question}` : PROMPT

    // Cuerpo de la imagen descargado UNA vez y reusado si hay que escalar.
    let svgMarkup: string | null = null
    let bytes: Uint8Array | null = null
    if (isSvg) {
      // La visión no acepta SVG, pero es XML: el markup revela colores
      // (fills/strokes), viewBox (proporción) y estructura mejor que un raster.
      svgMarkup = (await res.text()).slice(0, 30_000)
    } else {
      bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > 8 * 1024 * 1024) {
        throw new Error("Imagen demasiado grande para analizar (>8 MB).")
      }
    }

    const callVision = async (model: string): Promise<string> => {
      if (svgMarkup !== null) {
        const result = await generateText({
          model: openai(model),
          prompt: `${promptText}\n\nLa "imagen" es un SVG (logo vectorial — máxima calidad posible para logo). Analiza su markup: colores reales en fills/strokes/gradients, proporción por viewBox (cuadrado ≈ isotipo, ancho ≈ wordmark), y estructura:\n\n\`\`\`svg\n${svgMarkup}\n\`\`\``,
        })
        return result.text
      }
      const result = await generateText({
        model: openai(model),
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: bytes!, mediaType: contentType },
              { type: "text", text: promptText },
            ],
          },
        ],
      })
      return result.text
    }

    // El modelo devuelve JSON plano; si viniera envuelto, se extrae.
    const parse = (text: string): Record<string, unknown> | null => {
      const raw = text.trim().replace(/^```(?:json)?\n?|```$/g, "")
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        return null
      }
    }

    let model = VISION_PRIMARY
    let text = await callVision(model)
    let parsed = parse(text)
    // Escala a 5.1 si mini no dio JSON válido, o si está a punto de PROMOVER un
    // logo (la decisión sensible: no queremos que un placeholder de Canva pase
    // como logo por un mini con menos world-knowledge).
    const promotesLogo =
      parsed?.isLogoCandidate === true && Number(parsed?.logoScore ?? 0) >= 4
    if ((parsed === null || promotesLogo) && model !== VISION_FALLBACK) {
      model = VISION_FALLBACK
      text = await callVision(model)
      parsed = parse(text)
    }

    if (parsed) {
      return { analysis: parsed, model }
    }
    return {
      analysis: null,
      model,
      rawText: text.trim().replace(/^```(?:json)?\n?|```$/g, "").slice(0, 1500),
    }
  },
})
