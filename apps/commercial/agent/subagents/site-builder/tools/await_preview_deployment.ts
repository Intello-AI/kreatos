import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity } from "../../../lib/leads"
import { getSite, setSiteStatus, setVersionPreview } from "../lib/sites"
import { getLatestDeployment, getPreferredUrl } from "../lib/vercel"

const POLL_INTERVAL_MS = 10_000
const TIMEOUT_MS = 6 * 60_000

export default defineTool({
  description:
    "Espera a que el deployment preview del commit esté READY en Vercel (poll, timeout 6 min). En READY: guarda preview_url en la versión, pone sites.status='preview' y registra el hito en lead_activity. Devuelve el estado final.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z.number().int().min(1),
    commitSha: z.string().min(7).describe("SHA devuelto por push_site_version."),
  }),
  async execute({ siteId, versionN, commitSha }) {
    const site = await getSite(siteId)
    if (!site.vercel_project_id) {
      throw new Error(
        "El site no tiene vercel_project_id; corre create_vercel_project primero.",
      )
    }

    const deadline = Date.now() + TIMEOUT_MS
    while (Date.now() < deadline) {
      const deployment = await getLatestDeployment({
        projectId: site.vercel_project_id,
        commitSha,
      })

      if (deployment?.state === "READY" && deployment.url) {
        // Alias limpio de rama (la URL directa lleva hash y está protegida).
        const previewUrl = deployment.uid
          ? ((await getPreferredUrl({
              deploymentUid: deployment.uid,
              kind: "preview",
              fallback: deployment.url,
            })) ?? deployment.url)
          : deployment.url
        await setVersionPreview({ siteId, versionN, previewUrl })
        await setSiteStatus(siteId, "preview")
        await addActivity({
          leadId: site.lead_id,
          type: "site_preview_ready",
          note: `v${versionN} lista para revisión: ${previewUrl}`,
          actor: "site-builder",
        })
        return { state: "READY" as const, previewUrl }
      }

      if (deployment?.state === "ERROR" || deployment?.state === "CANCELED") {
        return {
          state: deployment.state,
          previewUrl: null,
          hint: "Revisa los logs del deployment en Vercel; el build local pasó pero el de Vercel falló.",
        }
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    return {
      state: "TIMEOUT" as const,
      previewUrl: null,
      hint: "El deployment no llegó a READY en 6 min. Reintenta esta tool una vez; si persiste, reporta y marca failed.",
    }
  },
})
