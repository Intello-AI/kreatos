import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity } from "../../../lib/leads"
import { getGithubEnv, mergeBranchToMain } from "../lib/github"
import { getSite, setSiteStatus, updateSite } from "../lib/sites"
import { getLatestDeployment, getPreferredUrl } from "../lib/vercel"

const POLL_INTERVAL_MS = 10_000
const TIMEOUT_MS = 6 * 60_000

export default defineTool({
  description:
    "Publica el sitio: merge de la rama v{N} a main (dispara el deployment de producción en Vercel), espera READY, guarda deploy_url y marca published. SOLO usar cuando el humano pidió publicar explícitamente — nunca por iniciativa propia.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z
      .number()
      .int()
      .min(1)
      .describe("Versión aprobada a publicar (rama v{N})."),
  }),
  async execute({ siteId, versionN }) {
    const site = await getSite(siteId)
    if (site.status !== "approved") {
      throw new Error(
        `Solo se publica un sitio en status 'approved' (actual: ${site.status}). El humano aprueba desde el dashboard.`,
      )
    }
    if (!site.vercel_project_id) {
      throw new Error("El site no tiene vercel_project_id.")
    }

    const env = getGithubEnv()
    await mergeBranchToMain(`${env.org}/${site.slug}`, `v${versionN}`)

    const deadline = Date.now() + TIMEOUT_MS
    while (Date.now() < deadline) {
      const deployment = await getLatestDeployment({
        projectId: site.vercel_project_id,
      })
      if (deployment?.state === "READY" && deployment.url) {
        // Dominio limpio del proyecto (slug.vercel.app), no la URL con hash.
        const deployUrl = deployment.uid
          ? ((await getPreferredUrl({
              deploymentUid: deployment.uid,
              kind: "production",
              fallback: deployment.url,
            })) ?? deployment.url)
          : deployment.url
        await updateSite(siteId, { deploy_url: deployUrl })
        await setSiteStatus(siteId, "published")
        await addActivity({
          leadId: site.lead_id,
          type: "site_published",
          note: `v${versionN} publicada: ${deployUrl}`,
          actor: "site-builder",
        })
        return { state: "READY" as const, deployUrl }
      }
      if (deployment?.state === "ERROR") {
        return {
          state: "ERROR" as const,
          deployUrl: null,
          hint: "El merge se hizo pero el deployment de producción falló; revisa logs en Vercel.",
        }
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    return { state: "TIMEOUT" as const, deployUrl: null }
  },
})
