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
    await getSite(siteId) // valida existencia
    const branch = `v${versionN}`
    const sandbox = await ctx.getSandbox()

    const escaped = commitMessage.replace(/"/g, '\\"')
    const push = await sandbox.run({
      command: `cd site && git checkout -B ${branch} && git add -A && git commit -m "${escaped}" && git push -f origin ${branch}`,
    })
    if (push.exitCode !== 0) {
      throw new Error(`git push falló: ${push.stderr}`)
    }

    const sha = await sandbox.run({ command: `cd site && git rev-parse HEAD` })
    return { branch, commitSha: sha.stdout.trim() }
  },
})
