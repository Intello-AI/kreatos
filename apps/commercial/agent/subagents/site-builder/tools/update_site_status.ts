import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity } from "../../../lib/leads"
import { getSite, setSiteStatus, type SiteStatus } from "../lib/sites"

export default defineTool({
  description:
    "Cambia el status del sitio validando la transición (brief→generating→preview→approved→published; failed recuperable). Úsala para 'generating' al empezar el build, 'failed' tras agotar reintentos, y 'published' tras publicar (solo cuando el humano lo pidió).",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    status: z.enum(["generating", "preview", "approved", "published", "failed"]),
    note: z
      .string()
      .optional()
      .describe("Contexto del cambio (obligatorio para 'failed': qué falló)."),
  }),
  async execute({ siteId, status, note }) {
    if (status === "failed" && !note) {
      throw new Error("Para 'failed' incluye note explicando qué falló.")
    }
    const site = await getSite(siteId)
    await setSiteStatus(siteId, status as SiteStatus)
    await addActivity({
      leadId: site.lead_id,
      type: "site_status_change",
      note: `${site.status} → ${status}${note ? `: ${note}` : ""}`,
      actor: "site-builder",
    })
    return { previous: site.status, status }
  },
})
