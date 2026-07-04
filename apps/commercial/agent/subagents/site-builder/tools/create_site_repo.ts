import { defineTool } from "eve/tools"
import { z } from "zod"

import { createRepoFromTemplate } from "../lib/github"
import { getSite, updateSite } from "../lib/sites"

export default defineTool({
  description:
    "Crea el repo GitHub del cliente generándolo desde el template de kreatos (idempotente: si ya existe lo devuelve). Guarda repo_url en sites. Hazlo UNA vez por sitio, antes de clone_site_repo.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
  }),
  async execute({ siteId }) {
    const site = await getSite(siteId)
    const { repoUrl, fullName, alreadyExisted } = await createRepoFromTemplate(
      site.slug,
    )
    if (site.repo_url !== repoUrl) {
      await updateSite(siteId, { repo_url: repoUrl })
    }
    return { repoUrl, fullName, alreadyExisted }
  },
})
