import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"
import { z } from "zod"

export default defineAgent({
  description:
    "Redacta borradores de primer contacto (mensaje de WhatsApp o guion de llamada) para leads con propuesta lista (proposal_ready). NUNCA envía nada: solo deja borradores en lead_activity para revisión humana. Devuelve resultado estructurado (task mode): {draftsCount, drafts[], skipped[]}.",
  // Borradores cortos que revisa un humano: mini alcanza.
  model: openai("gpt-5-mini"),
  reasoning: "low",
  limits: {
    maxOutputTokensPerSession: 60_000,
  },
  // Task mode: los borradores completos quedan en lead_activity; el root
  // solo necesita el conteo y los saltados.
  outputSchema: z.object({
    draftsCount: z.number().int(),
    drafts: z.array(
      z.object({
        leadName: z.string(),
        channel: z.enum(["whatsapp", "phone_script"]),
      }),
    ),
    skipped: z.array(
      z.object({
        leadName: z.string(),
        reason: z.string(),
      }),
    ),
  }),
})
