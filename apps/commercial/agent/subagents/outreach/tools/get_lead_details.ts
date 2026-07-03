import { defineTool } from "eve/tools"
import { z } from "zod"

import { findLead, listActivity, listLeads } from "../../../lib/leads"

export default defineTool({
  description:
    "Lee leads con propuesta lista. Sin `query` lista los leads en status proposal_ready; con `query` (place_id o nombre) devuelve un lead puntual junto con su historial de actividad (propuesta y borradores previos).",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .optional()
      .describe("place_id exacto o nombre (parcial) del negocio."),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ query, limit }) {
    if (!query) {
      return { leads: await listLeads("proposal_ready", limit) }
    }
    const lead = await findLead(query)
    if (!lead) return { leads: [] }
    const activity = await listActivity(lead.id)
    return { leads: [{ ...lead, activity }] }
  },
})
