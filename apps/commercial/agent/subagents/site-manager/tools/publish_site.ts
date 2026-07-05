import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity } from "../../../lib/leads"
import { getGithubEnv, getRepoFileText, mergeBranchToMain } from "../../site-builder/lib/github"
import { getSite, setSiteStatus, updateSite } from "../../site-builder/lib/sites"
import {
  getDeploymentBuildLog,
  getLatestDeployment,
  getPreferredUrl,
} from "../../site-builder/lib/vercel"

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

    // Guard anti-mock: el preview es un demo de venta y ADMITE datos mock
    // (marcados con "// MOCK" en site.config.ts); producción se indexa y NO.
    // Se valida el config de la rama que se va a mergear.
    {
      const config = await getRepoFileText(
        `${env.org}/${site.slug}`,
        "site.config.ts",
        `v${versionN}`,
      )
      if (config) {
        const mockSignals = [
          { re: /\/\/\s*MOCK/i, label: 'marcador "// MOCK"' },
          { re: /0{3}[\s-]?0{2,4}/, label: "teléfono mock (000 0000)" },
          { re: /ejemplo\.com|example\.com/i, label: "email/dominio de ejemplo" },
          { re: /"zip":\s*"0{5}"/, label: "zip 00000" },
        ]
        const found = mockSignals.filter((s) => s.re.test(config))
        if (found.length > 0) {
          throw new Error(
            `Publicación rechazada: site.config.ts de v${versionN} aún trae datos MOCK del demo (${found
              .map((f) => f.label)
              .join(
                ", ",
              )}). Producción se indexa: sustituye los mocks por los datos reales del cliente (nueva versión con el config corregido), re-aprueba y publica.`,
          )
        }
      }
    }

    const { mergeSha } = await mergeBranchToMain(
      `${env.org}/${site.slug}`,
      `v${versionN}`,
    )

    const deadline = Date.now() + TIMEOUT_MS
    while (Date.now() < deadline) {
      // Con mergeSha se espera el deployment de ESE commit (sin él, el poll
      // podría agarrar un production deployment anterior ya READY).
      const deployment = await getLatestDeployment({
        projectId: site.vercel_project_id,
        ...(mergeSha ? { commitSha: mergeSha } : {}),
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
        await updateSite(siteId, {
          deploy_url: deployUrl,
          published_at: new Date().toISOString(),
        })
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
        const buildLog = deployment.uid
          ? await getDeploymentBuildLog({
              deploymentUid: deployment.uid,
              maxChars: 4000,
            }).catch(() => null)
          : null
        return {
          state: "ERROR" as const,
          deployUrl: null,
          buildLog,
          hint: "El merge se hizo pero el deployment de producción falló — el buildLog trae la causa; corrige y vuelve a publicar.",
        }
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    return { state: "TIMEOUT" as const, deployUrl: null }
  },
})
