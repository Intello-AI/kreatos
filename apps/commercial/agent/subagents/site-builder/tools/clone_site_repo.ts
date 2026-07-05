import { defineTool } from "eve/tools"
import { z } from "zod"

import { getAuthenticatedCloneUrl, getGithubEnv } from "../lib/github"
import { getLatestVersion, waitForRepoUrl } from "../lib/sites"

export default defineTool({
  description:
    "Clona el repo del cliente en /workspace/site dentro del sandbox y configura git (user, credenciales). Después de esto edita los archivos con las herramientas de sandbox y corre `pnpm install` ahí.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
  }),
  async execute({ siteId }, ctx) {
    // Tolera ejecutarse en paralelo con create_site_repo (mismo turno).
    const site = await waitForRepoUrl(siteId)
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

    // Continuar donde se quedó: si la rama de la versión vigente ya existe en
    // origin (checkpoints de un run anterior), se retoma desde ahí en vez de
    // re-materializar todo desde main.
    let resumedFromBranch: string | null = null
    if (site.current_version) {
      const branch = `v${site.current_version}`
      const fetch = await sandbox.run({
        command: `cd site && git fetch --depth 1 origin ${branch} && git checkout -B ${branch} FETCH_HEAD`,
      })
      if (fetch.exitCode === 0) resumedFromBranch = branch
    }

    // El spec vigente viaja COMO ARCHIVO junto al código: siempre re-leíble
    // aunque el contexto del run se compacte o el output de get_site_brief
    // quede atrás. Vive en .agent/ (excluido del repo por el push tool).
    let specWritten = false
    const latest = await getLatestVersion(siteId)
    if (latest?.spec) {
      await sandbox.writeTextFile({
        path: "site/.agent/spec.json",
        content: JSON.stringify(
          { versionN: latest.version_n, changelog: latest.changelog, spec: latest.spec },
          null,
          2,
        ),
      })
      specWritten = true
    }

    return {
      path: "/workspace/site",
      repo: fullName,
      resumedFromBranch,
      ...(specWritten ? { specFile: "site/.agent/spec.json" } : {}),
      hint: [
        resumedFromBranch
          ? `El clone quedó en la rama ${resumedFromBranch} con el trabajo del run anterior (checkpoints): revisa git log y el estado de los archivos antes de re-materializar nada.`
          : "Clone limpio desde main.",
        specWritten
          ? "El SPEC VIGENTE (del art-director) está en site/.agent/spec.json — es tu ÚNICA fuente al materializar: reléelo con read_file cada vez que dudes del copy, la paleta o las secciones. El demo del template NUNCA es fuente."
          : "Este site aún no tiene spec guardado (¿falta art-director?).",
      ].join(" "),
    }
  },
})
