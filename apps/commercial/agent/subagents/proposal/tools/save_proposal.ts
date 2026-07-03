import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity, findLead, setLeadStatus } from "../../../lib/leads"

export default defineTool({
  description:
    "Guarda la propuesta de sitio web de un lead en lead_activity y marca el lead como proposal_ready. Rechaza leads que no estén en status `new` para no duplicar propuestas.",
  inputSchema: z.object({
    placeId: z.string().min(1).describe("place_id del lead."),
    proposal: z
      .string()
      .min(50)
      .describe("Propuesta completa en markdown, en español."),
  }),
  async execute({ placeId, proposal }) {
    const lead = await findLead(placeId)
    if (!lead) {
      throw new Error(`No existe lead con place_id ${placeId}.`)
    }
    if (lead.status !== "new") {
      return {
        saved: false,
        reason: `Lead "${lead.name}" tiene status ${lead.status}; solo se proponen leads en status new.`,
      }
    }

    await addActivity({
      leadId: lead.id,
      type: "proposal",
      note: proposal,
      actor: "proposal",
    })
    await setLeadStatus(lead.id, "proposal_ready")

    return { saved: true, lead: lead.name, status: "proposal_ready" }
  },
})
