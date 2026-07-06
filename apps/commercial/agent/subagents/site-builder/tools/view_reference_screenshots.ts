import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

/**
 * Ojos para la fase spec: el site-builder no procesa imágenes en su loop,
 * así que este tool VE las capturas de una referencia (Storage) con un
 * modelo de visión y responde la pregunta de diseño concreta.
 */
export default defineTool({
  description:
    "VE las capturas reales (desktop/mobile) de una referencia de la biblioteca y responde VARIAS preguntas de diseño en UNA sola pasada de visión (hero, ritmo de secciones, retícula, colapso en mobile...). Úsalo en fase spec sobre la referencia guía antes de decidir composición — el analysis en texto no sustituye VERLA. Batchea TODAS tus preguntas sobre la misma referencia en una llamada (no la re-llames por pregunta). Las URLs vienen en designReferences[].screenshotUrl del brief.",
  inputSchema: z.object({
    screenshotUrls: z
      .array(z.string().url())
      .min(1)
      .max(3)
      .describe(
        "URLs públicas de las capturas (screenshotUrl y/o screenshotMobileUrl del brief).",
      ),
    questions: z
      .array(z.string().min(10))
      .min(1)
      .max(5)
      .describe(
        "TODAS tus preguntas sobre esta referencia, en una sola llamada (composición del hero, ritmo de secciones, retícula de servicios, colapso en mobile...). Se responden numeradas sobre las MISMAS capturas — no hagas una llamada por pregunta.",
      ),
  }),
  async execute({ screenshotUrls, questions }) {
    const images: Array<{ bytes: Uint8Array; mediaType: string }> = []
    let skippedSvg = false
    for (const url of screenshotUrls) {
      // La visión NO soporta SVG: mandarlo crashea la llamada (pasó en el run
      // de Halcones). Se filtra ANTES del fetch por extensión, y tras el fetch
      // por content-type — así una llamada muerta no dispara un reintento.
      if (url.toLowerCase().endsWith(".svg")) {
        skippedSvg = true
        continue
      }
      const res = await fetch(url)
      if (!res.ok) continue
      const type = res.headers.get("content-type") ?? "image/png"
      if (type.includes("svg")) {
        skippedSvg = true
        continue
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > 12 * 1024 * 1024) continue
      images.push({ bytes, mediaType: type })
    }
    if (images.length === 0) {
      throw new Error(
        skippedSvg
          ? "Todas las URLs eran SVG/vectoriales y la visión no las procesa. Usa el `analysis` en texto de esa referencia (no la re-mandes a este tool)."
          : "No se pudo descargar ninguna captura (¿la referencia tiene screenshots? design-scout las genera al analizar).",
      )
    }

    const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    const result = await generateText({
      model: openai("gpt-5.1"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Eres un director de arte estudiando un sitio de referencia para ROBAR decisiones de diseño (composición, jerarquía, ritmo — nunca copiar contenido). Estas son capturas full-page reales. Responde CADA pregunta numerada con precisión visual y accionable, etiquetando la respuesta con su número:\n\n${numbered}`,
            },
            ...images.map((img) => ({
              type: "image" as const,
              image: img.bytes,
              mediaType: img.mediaType,
            })),
          ],
        },
      ],
    })
    return { answers: result.text }
  },
})
