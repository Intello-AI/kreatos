import { defineTool } from "eve/tools"
import { z } from "zod"

import { findLead, listLeads } from "../../../lib/leads"

export default defineTool({
  description:
    "Lee leads guardados en Supabase. Sin `query` lista los leads con status `new` (pendientes de propuesta); con `query` busca un lead puntual por place_id o nombre.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .optional()
      .describe("place_id exacto o nombre (parcial) del negocio a buscar."),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ query, limit }) {
    if (query) {
      const lead = await findLead(query)
      return { leads: lead ? [lead] : [] }
    }
    return { leads: await listLeads("new", limit) }
  },
})
