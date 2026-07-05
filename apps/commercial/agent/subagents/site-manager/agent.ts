import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

// Mismo toggle que site-builder: ambos trabajan código del template.
const MODEL_TOGGLE: Record<string, string> = {
  gpt: "gpt-5.4",
  "gpt-mini": "gpt-5.4-mini",
}
const gptModel = MODEL_TOGGLE[process.env.SITE_BUILDER_MODEL ?? ""]

export default defineAgent({
  description:
    "Gestor POST-VENTA de sitios: el ÚNICO que publica a producción (merge a main). Aplica cambios y mejoras sobre sitios ya construidos partiendo del CÓDIGO REAL del repo (no del spec), completa los placeholders del demo con el material real del cliente (pregunta al humano qué falta), y publica cuando el humano lo pide. Delegar aquí: 'publica el sitio X', 'cámbiale/mejora X al sitio ya construido', 'completa el sitio con el material del cliente'.",
  model: gptModel ? openai(gptModel) : anthropic("claude-sonnet-5"),
  compaction: {
    thresholdPercent: 0.7,
  },
  // Iteraciones sobre repos existentes acumulan menos input que un build
  // completo, pero los ciclos de build/QA siguen siendo largos.
  limits: {
    maxInputTokensPerSession: 20_000_000,
  },
})
