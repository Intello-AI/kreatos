import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSite } from "../lib/sites"
import { getDeploymentBuildLog, getLatestDeployment } from "../lib/vercel"

export default defineTool({
  description:
    "Lee el log de build del deployment en Vercel del sitio (autenticado con VERCEL_TOKEN). Úsalo para diagnosticar por qué falló un build o deployment — NUNCA intentes leer logs de Vercel/GitHub con web_fetch: esas páginas requieren sesión y devuelven 403/404.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    commitSha: z
      .string()
      .min(7)
      .optional()
      .describe(
        "SHA del commit cuyo deployment quieres inspeccionar; sin él se usa el deployment más reciente del proyecto.",
      ),
  }),
  async execute({ siteId, commitSha }) {
    const site = await getSite(siteId)
    if (!site.vercel_project_id) {
      throw new Error(
        "El site no tiene vercel_project_id; no hay deployments que inspeccionar.",
      )
    }
    const deployment = await getLatestDeployment({
      projectId: site.vercel_project_id,
      commitSha,
    })
    if (!deployment?.uid) {
      return {
        state: null,
        log: null,
        hint: "El proyecto no tiene deployments todavía (¿el push llegó a GitHub? ¿la GitHub App de Vercel está instalada en la org?).",
      }
    }
    const log = await getDeploymentBuildLog({ deploymentUid: deployment.uid })
    return {
      state: deployment.state,
      url: deployment.url,
      log: log || "(el deployment no emitió log de build)",
    }
  },
})
