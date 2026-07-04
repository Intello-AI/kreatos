import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

const PROMPT = `Eres un director de arte. Analiza esta imagen de la marca de un negocio local y responde SOLO un JSON válido (sin markdown) con esta forma:
{
  "description": "qué es la imagen, en una frase",
  "isLogoCandidate": true/false,
  "logoScore": 1-5,
  "logoNotes": "por qué sirve o no como logo (fondo, resolución, vectorial vs foto)",
  "dominantColors": ["#hex en orden de dominancia, máx 6"],
  "tokens": { "background": "#hex", "foreground": "#hex", "primary": "#hex", "muted-foreground": "#hex", "border": "#hex" },
  "siteImageUse": "hero | about | portfolio | none — y por qué en 3-5 palabras",
  "quality": "nítida/borrosa, resolución aparente, observaciones"
}
En "tokens" traduce la paleta al rol funcional (el color protagonista de la marca → primary). Si la imagen es un screenshot de un sitio/red social de la marca, extrae la paleta REAL visible.`

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

    let text: string
    if (isSvg) {
      // La visión no acepta SVG, pero es XML: el markup revela colores
      // (fills/strokes), viewBox (proporción) y estructura mejor que un
      // raster. Se analiza como texto.
      const markup = (await res.text()).slice(0, 30_000)
      const result = await generateText({
        model: anthropic("claude-opus-4-8"),
        prompt: `${promptText}\n\nLa "imagen" es un SVG (logo vectorial — máxima calidad posible para logo). Analiza su markup: colores reales en fills/strokes/gradients, proporción por viewBox (cuadrado ≈ isotipo, ancho ≈ wordmark), y estructura:\n\n\`\`\`svg\n${markup}\n\`\`\``,
      })
      text = result.text
    } else {
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > 8 * 1024 * 1024) {
        throw new Error("Imagen demasiado grande para analizar (>8 MB).")
      }
      const result = await generateText({
        model: anthropic("claude-opus-4-8"),
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: bytes, mediaType: contentType },
              { type: "text", text: promptText },
            ],
          },
        ],
      })
      text = result.text
    }

    // El modelo devuelve JSON plano; si viniera envuelto, se extrae.
    const raw = text.trim().replace(/^```(?:json)?\n?|```$/g, "")
    try {
      return { analysis: JSON.parse(raw) as Record<string, unknown> }
    } catch {
      return { analysis: null, rawText: raw.slice(0, 1500) }
    }
  },
})
