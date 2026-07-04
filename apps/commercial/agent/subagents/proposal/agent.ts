import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"
import { z } from "zod"

export default defineAgent({
  description:
    "Genera una propuesta de sitio web personalizada para un lead ya guardado (negocio local sin web) y lo marca como proposal_ready. Delegar aquí pedidos de generar/preparar propuestas para leads existentes. Devuelve resultado estructurado (task mode): {createdCount, created[], skipped[]}.",
  // La propuesta es el producto: redacción persuasiva de calidad.
  model: openai("gpt-5.1"),
  reasoning: "medium",
  limits: {
    maxOutputTokensPerSession: 120_000,
  },
  // Task mode: la propuesta completa queda en la BDD; el root solo necesita
  // saber qué se creó y qué se saltó.
  outputSchema: z.object({
    createdCount: z.number().int(),
    created: z.array(
      z.object({
        leadName: z.string(),
        angle: z.string().describe("Una línea: el ángulo de la propuesta"),
      }),
    ),
    skipped: z.array(
      z.object({
        leadName: z.string(),
        reason: z.string().describe("ya tenía propuesta / status avanzado / no existe"),
      }),
    ),
  }),
})
