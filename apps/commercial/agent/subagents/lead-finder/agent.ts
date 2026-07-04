import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"
import { z } from "zod"

export default defineAgent({
  description:
    "Busca negocios locales SIN sitio web en Google Maps (Places API) para una categoría y ciudad dadas, los califica con criterios de calidad y los guarda como leads en Supabase. Delegar aquí cualquier pedido de encontrar/buscar leads nuevos. Devuelve resultado estructurado (task mode): {category, city, savedCount, alreadyKnownCount, discardedCount, saved[], notes}.",
  model: openai("gpt-5-nano"),
  // Tarea mecánica (buscar → filtrar por criterios → guardar): sin
  // reasoning largo; corre en el schedule diario donde el costo se repite.
  reasoning: "low",
  limits: {
    maxOutputTokensPerSession: 100_000,
  },
  // Task mode: el reporte al orquestador es JSON, no prosa — más barato de
  // producir y el root lleva el tope de la corrida sin interpretar texto.
  outputSchema: z.object({
    category: z.string().describe("Categoría buscada"),
    city: z.string(),
    savedCount: z.number().int(),
    alreadyKnownCount: z.number().int(),
    discardedCount: z.number().int(),
    saved: z
      .array(
        z.object({
          name: z.string(),
          rating: z.number().nullable(),
          reviews: z.number().int().nullable(),
        }),
      )
      .describe("Solo los leads guardados en esta corrida"),
    notes: z
      .string()
      .describe("Una línea: motivo dominante de descartes o vacío"),
  }),
})
