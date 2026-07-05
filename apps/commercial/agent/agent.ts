import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

// Orquestador. La experiencia con gpt-5-mini (2026-07-04): ignoraba las
// reglas de encadenamiento (preguntaba "¿confirmas?", cortaba cadenas a
// medias, pedía IDs que ya traía el [Contexto: ...]). El ruteo es el paso
// más frecuente Y el que más fricción humana genera cuando falla — aquí el
// modelo mejor se paga solo. Toggle ROOT_MODEL para experimentar (p. ej.
// "gpt-5-mini" para volver al barato).
const rootModel = process.env.ROOT_MODEL || "gpt-5.1"

export default defineAgent({
  model: openai(rootModel),
  reasoning: "medium",
  limits: {
    // Guardrail de costo: el root escribe poco (rutas + resúmenes).
    maxOutputTokensPerSession: 300_000,
  },
})
