import { defineTool } from "eve/tools"
import { z } from "zod"

import { getAuthenticatedCloneUrl, getGithubEnv } from "../lib/github"
import { getSite } from "../lib/sites"

/**
 * Botón de reset: deja el working tree del clone como el template MÁS
 * RECIENTE (motor actualizado con todos los fixes), conservando .git y el
 * historial. Para clones nacidos de un template viejo (schema desactualizado,
 * bugs ya corregidos en el motor) o en estado inconsistente: en vez de
 * parchear el motor a mano, reset + re-materializar desde latestSpec.
 */
export default defineTool({
  description:
    "Resetea el working tree del clone (/workspace/site) al template MÁS RECIENTE de kreatos, conservando el historial git. Úsalo cuando el motor del clone esté desactualizado (validate-config falla por reglas que el template actual ya corrigió, archivos del motor con bugs ya arreglados) o el estado del repo sea inconsistente. Después del reset el repo queda PELÓN: re-materializa TODO desde latestSpec (fetch_brand_assets + draft_surface + custom sections) y haz checkpoint inmediato. main del repo del cliente NO se toca (el reset vive en tu working tree hasta que pushees a v{N}).",
  inputSchema: z.object({
    siteId: z.string().uuid(),
  }),
  async execute({ siteId }, ctx) {
    // Valida que el site exista (y por claridad del flujo).
    await getSite(siteId)
    const env = getGithubEnv()
    const sandbox = await ctx.getSandbox()

    // ¿Hay clone?
    const check = await sandbox.run({ command: "test -d site/.git && echo ok" })
    if (!check.stdout.includes("ok")) {
      throw new Error(
        "No hay clone en /workspace/site — corre clone_site_repo primero.",
      )
    }

    // Template fresco (shallow) sin su .git.
    const templateUrl = getAuthenticatedCloneUrl(
      `${env.org}/${process.env.SITE_TEMPLATE_REPO ?? "site-template"}`,
    )
    const fetchTemplate = await sandbox.run({
      command: `rm -rf /tmp/template && git clone --depth 1 ${templateUrl} /tmp/template && rm -rf /tmp/template/.git`,
    })
    if (fetchTemplate.exitCode !== 0) {
      throw new Error(
        `No se pudo clonar el template: ${fetchTemplate.stderr.slice(-400)}`,
      )
    }

    // Working tree = template actual, conservando .git (historial/checkpoints).
    const reset = await sandbox.run({
      command: `cd site && find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} + && cp -R /tmp/template/. . && rm -rf /tmp/template`,
    })
    if (reset.exitCode !== 0) {
      throw new Error(`El reset falló: ${reset.stderr.slice(-400)}`)
    }

    return {
      reset: true,
      hint: "Working tree = template ACTUAL (motor con todos los fixes), historial git intacto. El repo está PELÓN: re-materializa TODO desde latestSpec — fetch_brand_assets, draft_surface (config/es.json/theme/fonts), custom sections — y push_site_version checkpoint:true en cuanto termines de materializar. Corre pnpm install antes del build (dependencias del template pueden haber cambiado).",
    }
  },
})
