import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSite } from "../lib/sites"

export default defineTool({
  description:
    "Commit y push del contenido de /workspace/site a la rama v{N} del repo del cliente (NUNCA a main — publicar a main es acción humana). Corre esto solo después de que `pnpm build` y `pnpm qa` pasaron en el sandbox.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z.number().int().min(1),
    commitMessage: z
      .string()
      .min(10)
      .describe("Mensaje de commit descriptivo de la versión."),
  }),
  async execute({ siteId, versionN, commitMessage }, ctx) {
    const site = await getSite(siteId)
    // Invariante: una versión = una rama. Solo se puede pushear la versión
    // que save_site_version acaba de registrar como current_version.
    if (versionN !== site.current_version) {
      throw new Error(
        `versionN=${versionN} no coincide con current_version=${site.current_version}. ` +
          `Guarda primero el spec con save_site_version; la rama debe ser v{current_version}.`,
      )
    }
    const branch = `v${versionN}`
    const sandbox = await ctx.getSandbox()

    const escaped = commitMessage.replace(/"/g, '\\"')
    // Guard explícito: sin cambios no hay versión que pushear — el error de
    // "nothing to commit" enterrado en stdout confundía al agente.
    const dirty = await sandbox.run({
      command: `cd site && git status --porcelain | head -1`,
    })
    if (!dirty.stdout.trim()) {
      throw new Error(
        "No hay cambios que commitear: el working tree está limpio. ¿Aplicaste la personalización sobre el clone? (Si el run anterior murió sin pushear, su trabajo se perdió con su sandbox: re-materializa el spec vigente antes de pushear.)",
      )
    }
    const push = await sandbox.run({
      command: `cd site && git checkout -B ${branch} && git add -A && git commit -m "${escaped}" && git push -f origin ${branch}`,
    })
    if (push.exitCode !== 0) {
      throw new Error(
        `git push falló (exit ${push.exitCode}):\n${[push.stderr, push.stdout].filter(Boolean).join("\n").slice(-1200)}`,
      )
    }

    const sha = await sandbox.run({ command: `cd site && git rev-parse HEAD` })
    return { branch, commitSha: sha.stdout.trim() }
  },
})
