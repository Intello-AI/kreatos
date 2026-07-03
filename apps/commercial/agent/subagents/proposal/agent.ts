import { anthropic } from "@ai-sdk/anthropic"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Genera una propuesta de sitio web personalizada para un lead ya guardado (negocio local sin web) y lo marca como proposal_ready. Delegar aquí pedidos de generar/preparar propuestas para leads existentes.",
  // Redacción persuasiva en español: la calidad de la propuesta es el producto.
  model: anthropic("claude-opus-4-8"),
})
