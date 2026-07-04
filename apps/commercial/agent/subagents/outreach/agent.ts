import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Redacta borradores de primer contacto (mensaje de WhatsApp o guion de llamada) para leads con propuesta lista (proposal_ready). NUNCA envía nada: solo deja borradores en lead_activity para revisión humana.",
  // Borradores cortos que revisa un humano: mini alcanza.
  model: openai("gpt-5-mini"),
})
