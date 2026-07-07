import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"
import { z } from "zod"

// Toggle de modelo del art-director. El art-director es el CEREBRO DE
// COMPOSICIÓN: en el motor 100%-custom decide TODO lo creativo por sitio
// (cuántas secciones, cuáles, cuántas páginas y rutas, concepto, paleta,
// tipografía) y el site-builder solo materializa. Ahí el modelo mejor se paga
// solo — un spec flojo se arrastra a todo el sitio.
//   ART_DIRECTOR_MODEL=gpt      → gpt-5.4 (frontier de OpenAI)
//   sin definir / "sonnet"      → claude-sonnet-5 (default: fuerte en dirección
//                                 de arte + visión, y eve le aplica prompt
//                                 caching de Anthropic automático — el system
//                                 prompt grande no se re-cobra cada request)
const AD_MODEL: Record<string, ReturnType<typeof openai>> = {
  gpt: openai("gpt-5.4"),
}
const adModel = AD_MODEL[process.env.ART_DIRECTOR_MODEL ?? ""]

export default defineAgent({
  description:
    "Director creativo: compone el SPEC de diseño de un sitio (concepto rector, referencias con takeaways, paleta desde la marca, tipografía, arquitectura de páginas y secciones con su porqué) desde el brief, la ficha de marca y la biblioteca de referencias, y lo guarda como versión. NO escribe código ni despliega. Delegar aquí ANTES de site-builder en toda generación nueva o rediseño mayor: 'compón el spec del site <uuid>'. Devuelve {versionN, concept, pages, notes}.",
  // La dirección de arte es donde el razonamiento paga: decide TODO lo
  // creativo una vez; site-builder después solo materializa.
  model: adModel ?? anthropic("claude-sonnet-5"),
  reasoning: "high",
  limits: {
    maxOutputTokensPerSession: 300_000,
  },
  // Task mode: el spec completo vive en site_versions; el reporte al root
  // es el resumen ejecutivo para encadenar con site-builder.
  outputSchema: z.object({
    versionN: z.number().int().min(1),
    concept: z
      .string()
      .describe("La idea rectora del sitio en 2-3 frases, tal como quedó en el spec."),
    pages: z
      .array(z.string())
      .describe('Rutas del sitemap decidido: ["/", "/servicios", ...]'),
    referencesUsed: z
      .array(z.string())
      .describe("Slugs de las referencias explotadas en el spec."),
    notes: z
      .string()
      .describe(
        "Decisiones que site-builder debe respetar al materializar y datos que quedaron como mock/omitidos.",
      ),
  }),
})
