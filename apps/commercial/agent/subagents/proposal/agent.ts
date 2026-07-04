import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Genera una propuesta de sitio web personalizada para un lead ya guardado (negocio local sin web) y lo marca como proposal_ready. Delegar aquí pedidos de generar/preparar propuestas para leads existentes.",
  // La propuesta es el producto: redacción persuasiva de calidad.
  model: openai("gpt-5.1"),
})
