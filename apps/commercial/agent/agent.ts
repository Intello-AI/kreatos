import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

// Orquestador: SOLO enruta y resume contexto al re-delegar. No necesita
// pensar hondo — reasoning bajo = el paso más frecuente del sistema (cada
// mensaje pasa por aquí) se vuelve más rápido y más barato.
export default defineAgent({
  model: openai("gpt-5-mini"),
  reasoning: "low",
  limits: {
    // Guardrail de costo: el root escribe poco (rutas + resúmenes).
    maxOutputTokensPerSession: 300_000,
  },
})
