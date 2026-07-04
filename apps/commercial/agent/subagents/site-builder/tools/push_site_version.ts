import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSite } from "../lib/sites"

export default defineTool({
  description:
    "Commit y push del contenido de /workspace/site a la rama v{N} del repo del cliente (NUNCA a main — publicar a main es acción humana). El push FINAL va después de que `pnpm build` y `pnpm qa` pasaron; con checkpoint=true puedes pushear WIP en hitos intermedios para que un run futuro retome donde te quedaste.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z.number().int().min(1),
    commitMessage: z
      .string()
      .min(10)
      .describe("Mensaje de commit descriptivo de la versión."),
    checkpoint: z
      .boolean()
      .default(false)
      .describe(
        "true = commit WIP intermedio (aún sin QA): mismo push a v{N}, mensaje prefijado 'wip:'. Working tree limpio es no-op, no error.",
      ),
  }),
  async execute({ siteId, versionN, commitMessage, checkpoint }, ctx) {
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
      if (checkpoint) {
        // Checkpoint sin cambios nuevos: no-op amistoso.
        const sha = await sandbox.run({ command: `cd site && git rev-parse HEAD` })
        return { branch, commitSha: sha.stdout.trim(), skipped: true }
      }
      throw new Error(
        "No hay cambios que commitear: el working tree está limpio. ¿Aplicaste la personalización sobre el clone? (Si el run anterior murió sin pushear, su trabajo se perdió con su sandbox: re-materializa el spec vigente antes de pushear.)",
      )
    }
    // Guard anti-template (solo push FINAL): si site.config.ts sigue siendo
    // el demo del template o no menciona al negocio, el repo NO está
    // personalizado — pushearlo desplegaría el template pelón como preview.
    if (!checkpoint) {
      const config = await sandbox.readTextFile({ path: "site/site.config.ts" })
      if (!config) {
        throw new Error("No existe site/site.config.ts en el clone — ¿corriste clone_site_repo y materializaste el spec?")
      }
      const { getSupabaseClient } = await import("../../../lib/supabase")
      const [{ data: lead }, { data: brand }] = await Promise.all([
        getSupabaseClient()
          .from("leads")
          .select("name")
          .eq("id", site.lead_id)
          .maybeSingle(),
        getSupabaseClient()
          .from("lead_brand")
          .select("short_name")
          .eq("lead_id", site.lead_id)
          .maybeSingle(),
      ])
      const configLower = config.toLowerCase()
      const names = [lead?.name, brand?.short_name].filter(
        (n): n is string => Boolean(n),
      )
      const mentionsBusiness =
        names.length === 0 ||
        names.some((n) => configLower.includes(n.toLowerCase()))
      if (configLower.includes("lópez y asociados") || !mentionsBusiness) {
        throw new Error(
          `El repo sigue siendo el TEMPLATE sin personalizar (site.config.ts no menciona "${names.join('" ni "')}"${configLower.includes("lópez y asociados") ? ' y aún trae el demo "López y Asociados"' : ""}). El run anterior murió sin checkpoints y este clone salió de main: re-materializa TODO desde latestSpec (config, es.json, theme, fonts, imágenes, custom) ANTES de pushear. Un fix puntual sobre el template pelón NO es una versión.`,
        )
      }
    }

    // El REMOTO es la fuente de verdad: si la rama avanzó desde que este run
    // clonó (otro run pusheó mientras tanto), un push -f pisaría ese trabajo.
    // Compare-before-push: solo se fuerza cuando el local contiene al remoto.
    await sandbox.run({
      command: `cd site && git fetch origin ${branch} 2>/dev/null; true`,
    })
    const behind = await sandbox.run({
      command: `cd site && git rev-list HEAD..origin/${branch} --count 2>/dev/null || echo 0`,
    })
    const behindCount = parseInt(behind.stdout.trim(), 10) || 0
    if (behindCount > 0) {
      throw new Error(
        `La rama ${branch} en el REMOTO tiene ${behindCount} commit(s) que tu clone no tiene (otro run pusheó después de que clonaste). No se fuerza el push para no destruir ese trabajo. Corre clone_site_repo de nuevo (retomará desde el remoto actualizado), revisa git log, y re-aplica SOLO lo que falte antes de volver a pushear.`,
      )
    }

    const message = checkpoint ? `wip: ${escaped}` : escaped
    const push = await sandbox.run({
      command: `cd site && git checkout -B ${branch} && git add -A && git commit -m "${message}" && git push -f origin ${branch}`,
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
