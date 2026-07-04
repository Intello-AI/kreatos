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
    // allowCancelled: retomar un site cancelado pasa por aquí
    // (cancelled → generating); setSiteStatus valida la transición.
    const site = await getSite(siteId, { allowCancelled: true })
    const { changed, previous } = await setSiteStatus(
      siteId,
      status as SiteStatus,
    )
    // Idempotente: el status ya era ese (retomas/reintentos) — no-op sin
    // ensuciar el timeline del lead.
    if (!changed) {
      return {
        previous,
        status,
        unchanged: true,
        hint: `El site ya estaba en "${status}"; continúa con el flujo.`,
      }
    }
    await addActivity({
      leadId: site.lead_id,
      type: "site_status_change",
      note: `${previous} → ${status}${note ? `: ${note}` : ""}`,
      actor: "site-builder",
    })
    return { previous, status }
  },
})
