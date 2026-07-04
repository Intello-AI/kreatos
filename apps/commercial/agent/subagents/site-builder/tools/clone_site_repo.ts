import { defineTool } from "eve/tools"
import { z } from "zod"

import { getAuthenticatedCloneUrl, getGithubEnv } from "../lib/github"
import { getSite } from "../lib/sites"

export default defineTool({
  description:
    "Clona el repo del cliente en /workspace/site dentro del sandbox y configura git (user, credenciales). Después de esto edita los archivos con las herramientas de sandbox y corre `pnpm install` ahí.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
  }),
  async execute({ siteId }, ctx) {
    const site = await getSite(siteId)
    if (!site.repo_url) {
      throw new Error(
        "El site no tiene repo_url; corre create_site_repo primero.",
      )
    }
    const env = getGithubEnv()
    const fullName = `${env.org}/${site.slug}`

    const sandbox = await ctx.getSandbox()
    await sandbox.removePath({ path: "site", force: true, recursive: true })

    // En prod (backend vercel) las credenciales las inyecta el network policy
    // (credential brokering); el token embebido en la URL es el camino de dev
    // (docker, sin brokering). La URL con token no se persiste: queda solo en
    // el remote del clone dentro del sandbox efímero.
    const cloneUrl = getAuthenticatedCloneUrl(fullName)
    const clone = await sandbox.run({
      command: `git clone --depth 1 ${cloneUrl} site`,
    })
    if (clone.exitCode !== 0) {
      throw new Error(`git clone falló: ${clone.stderr}`)
    }

    // El email debe corresponder a una cuenta GitHub del team de Vercel, si no
    // Vercel bloquea el deployment ("commit author could not be matched").
    const gitEmail = process.env.SITE_GIT_EMAIL ?? "jcampillo1207@gmail.com"
    await sandbox.run({
      command: `cd site && git config user.name "kreatos site-builder" && git config user.email "${gitEmail}"`,
    })

    return { path: "/workspace/site", repo: fullName }
  },
})
