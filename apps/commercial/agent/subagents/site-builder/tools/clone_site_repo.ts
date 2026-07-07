import { defineTool } from "eve/tools"
import { z } from "zod"

import { getAuthenticatedCloneUrl, getGithubEnv } from "../lib/github"
import { getLatestVersion, getSiteVersion, waitForRepoUrl } from "../lib/sites"

export default defineTool({
  description:
    "Clona el repo del cliente en /workspace/site dentro del sandbox y configura git (user, credenciales). Por default retoma la rama de la versión vigente (current_version); pasa `versionN` para clonar y trabajar una versión CONCRETA (p. ej. el humano eligió iterar la v2 aunque exista v3). Después de esto edita los archivos con las herramientas de sandbox y corre `pnpm install` ahí.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Versión/rama concreta a retomar (v{N}). Sin él, se usa la versión vigente (current_version).",
      ),
  }),
  async execute({ siteId, versionN }, ctx) {
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
    // Versión objetivo: la que pidió el humano (versionN) o la vigente.
    const targetVersion = versionN ?? site.current_version
    let resumedFromBranch: string | null = null
    if (targetVersion) {
      const branch = `v${targetVersion}`
      const fetch = await sandbox.run({
        command: `cd site && git fetch --depth 1 origin ${branch} && git checkout -B ${branch} FETCH_HEAD`,
      })
      if (fetch.exitCode === 0) resumedFromBranch = branch
    }

    // El spec de la versión objetivo viaja COMO ARCHIVO junto al código:
    // siempre re-leíble aunque el contexto del run se compacte. Vive en
    // .agent/ (excluido del repo por el push tool). Con versionN se lee ESE
    // spec; sin él, el vigente.
    const target = versionN
      ? await getSiteVersion(siteId, versionN)
      : await getLatestVersion(siteId)
    // Guard: sin spec NO hay nada que materializar. Antes se clonaba el demo
    // pelón con un hint suave y site-builder terminaba montando el despacho
    // ficticio. Un art-director que reporta versionN pero deja
    // current_version=null es un FALLO disfrazado de éxito: cortamos aquí para
    // que el orquestador re-delegue a art-director en vez de materializar sobre
    // la nada.
    if (!target?.spec) {
      throw new Error(
        `El site no tiene spec vigente (current_version=${site.current_version ?? "null"}): el art-director no guardó ninguna versión válida. No se puede materializar sin spec — el demo del template NUNCA es fuente. El orquestador debe delegar a art-director (compón/guarda el spec del site) ANTES de site-builder. Un reporte de art-director con versionN pero sin versión guardada es un fallo, no un éxito.`,
      )
    }
    await sandbox.writeTextFile({
      path: "site/.agent/spec.json",
      content: JSON.stringify(
        { versionN: target.version_n, changelog: target.changelog, spec: target.spec },
        null,
        2,
      ),
    })

    return {
      path: "/workspace/site",
      repo: fullName,
      resumedFromBranch,
      specFile: "site/.agent/spec.json",
      hint: [
        resumedFromBranch
          ? `El clone quedó en la rama ${resumedFromBranch} con el trabajo del run anterior (checkpoints): revisa git log y el estado de los archivos antes de re-materializar nada.`
          : "Clone limpio desde main.",
        "El SPEC VIGENTE (del art-director) está en site/.agent/spec.json — es tu ÚNICA fuente al materializar: reléelo con read_file cada vez que dudes del copy, la paleta o las secciones. El demo del template NUNCA es fuente.",
      ].join(" "),
    }
  },
})
