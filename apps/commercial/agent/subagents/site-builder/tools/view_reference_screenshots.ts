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
    "VE las capturas reales (desktop/mobile) de una referencia de la biblioteca y responde una pregunta de diseño concreta ('¿cómo compone el hero?', '¿cómo alterna fondos por scroll?', '¿cómo colapsa en mobile?'). Úsalo en fase spec sobre la referencia guía antes de decidir composición — el analysis en texto no sustituye VERLA. Las URLs vienen en designReferences[].screenshotUrl del brief.",
  inputSchema: z.object({
    screenshotUrls: z
      .array(z.string().url())
      .min(1)
      .max(3)
      .describe(
        "URLs públicas de las capturas (screenshotUrl y/o screenshotMobileUrl del brief).",
      ),
    question: z
      .string()
      .min(10)
      .describe(
        "Qué quieres ver/decidir: sé específico (composición del hero, ritmo de secciones, retícula de servicios...).",
      ),
  }),
  async execute({ screenshotUrls, question }) {
    const images: Array<{ bytes: Uint8Array; mediaType: string }> = []
    for (const url of screenshotUrls) {
      const res = await fetch(url)
      if (!res.ok) continue
      const type = res.headers.get("content-type") ?? "image/png"
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > 12 * 1024 * 1024) continue
      images.push({ bytes, mediaType: type })
    }
    if (images.length === 0) {
      throw new Error(
        "No se pudo descargar ninguna captura (¿la referencia tiene screenshots? design-scout las genera al analizar).",
      )
    }

    const result = await generateText({
      model: openai("gpt-5.1"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Eres un director de arte estudiando un sitio de referencia para ROBAR decisiones de diseño (composición, jerarquía, ritmo — nunca copiar contenido). Estas son capturas full-page reales. Responde con precisión visual y accionable:\n\n${question}`,
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
    return { answer: result.text }
  },
})
