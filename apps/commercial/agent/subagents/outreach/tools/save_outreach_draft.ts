import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity, findLead, listActivity } from "../../../lib/leads"

export default defineTool({
  description:
    "Guarda un borrador de primer contacto (WhatsApp o guion de llamada) en lead_activity para revisión humana. NO envía nada y NO cambia el status del lead. Rechaza leads sin propuesta lista y no duplica borradores del mismo canal.",
  inputSchema: z.object({
    placeId: z.string().min(1).describe("place_id del lead."),
    channel: z
      .enum(["whatsapp", "phone_script"])
      .describe("Canal del borrador: mensaje de WhatsApp o guion de llamada."),
    draft: z
      .string()
      .min(30)
      .describe("Borrador completo, en español."),
  }),
  async execute({ placeId, channel, draft }) {
    const lead = await findLead(placeId)
    if (!lead) {
      throw new Error(`No existe lead con place_id ${placeId}.`)
    }
    if (lead.status !== "proposal_ready") {
      return {
        saved: false,
        reason: `Lead "${lead.name}" tiene status ${lead.status}; outreach solo trabaja leads proposal_ready.`,
      }
    }

    const activityType = `outreach_draft_${channel}`
    const existing = await listActivity(lead.id, 50)
    if (existing.some((a) => a.type === activityType)) {
      return {
        saved: false,
        reason: `Lead "${lead.name}" ya tiene un borrador ${channel}; no se duplica.`,
      }
    }

    await addActivity({
      leadId: lead.id,
      type: activityType,
      note: draft,
      actor: "outreach",
    })

    return { saved: true, lead: lead.name, channel, sent: false }
  },
})
