import { anthropic } from "@ai-sdk/anthropic"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Redacta borradores de primer contacto (mensaje de WhatsApp o guion de llamada) para leads con propuesta lista (proposal_ready). NUNCA envía nada: solo deja borradores en lead_activity para revisión humana.",
  // Copy de primer contacto, sensible a tono; nunca envía nada.
  model: anthropic("claude-opus-4-8"),
})
