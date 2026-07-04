import { defineTool } from "eve/tools"
import { z } from "zod"

import { getGithubEnv } from "../lib/github"
import { getSite, updateSite } from "../lib/sites"
import { ensureVercelProject } from "../lib/vercel"

export default defineTool({
  description:
    "Crea (o devuelve si ya existe) el proyecto Vercel ligado al repo GitHub del cliente y guarda vercel_project_id en sites. Con el proyecto ligado, cada push a una rama v{N} dispara un deployment preview automáticamente.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
  }),
  async execute({ siteId }) {
    const site = await getSite(siteId)
    if (!site.repo_url) {
      throw new Error("El site no tiene repo_url; corre create_site_repo primero.")
    }
    const env = getGithubEnv()
    const { projectId, alreadyExisted } = await ensureVercelProject({
      slug: site.slug,
      repoFullName: `${env.org}/${site.slug}`,
    })
    if (site.vercel_project_id !== projectId) {
      await updateSite(siteId, { vercel_project_id: projectId })
    }
    return { projectId, alreadyExisted }
  },
})
