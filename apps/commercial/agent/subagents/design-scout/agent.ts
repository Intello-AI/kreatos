import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"
import { z } from "zod"

export default defineAgent({
  description:
    "Analiza sitios web de referencia (URLs que José carga en design_references): extrae sitemap, secciones, componentes, paleta, tipografía y qué robar/qué no, y guarda el análisis para que site-builder lo use en la fase de spec. Delegar aquí 'analiza las referencias pendientes' o 'analiza esta URL de referencia'. Devuelve resultado estructurado (task mode): {analyzed[], failed[], remainingPending}.",
  // El criterio de diseño del teardown es el valor de la biblioteca: corre
  // UNA vez por referencia y su análisis se reusa en cada sitio — aquí el
  // reasoning alto sí paga.
  model: openai("gpt-5.1"),
  reasoning: "high",
  limits: {
    maxOutputTokensPerSession: 400_000,
  },
  // Task mode: el análisis rico ya vive en design_references.analysis; el
  // reporte al root solo necesita el marcador de qué quedó hecho.
  outputSchema: z.object({
    analyzed: z.array(
      z.object({
        slug: z.string(),
        url: z.string(),
        qualityScore: z.number().int().min(1).max(5),
      }),
    ),
    failed: z.array(
      z.object({
        slug: z.string(),
        reason: z.string().describe("Una línea: por qué no se pudo analizar"),
      }),
    ),
    remainingPending: z
      .number()
      .int()
      .describe("Referencias aún pendientes en la cola"),
  }),
})
