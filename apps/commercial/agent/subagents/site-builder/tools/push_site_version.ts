import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSite } from "../lib/sites"

/**
 * Superficies EDITABLES del contrato del template. Todo lo demás es MOTOR
 * (components/sections, components/shared, lib/, scripts/, app/*.tsx...):
 * adaptarlo a una config inventada rompe el sitio y el contrato.
 */
const EDITABLE_PATHS: RegExp[] = [
  /^site\.config\.ts$/,
  /^messages\//,
  /^app\/theme\.css$/,
  /^app\/fonts\.ts$/,
  /^app\/(icon|apple-icon|favicon)\.[a-z]+$/,
  /^public\//,
  /^components\/custom\//,
  /^CHANGELOG/i,
  // Manifiesto de pendientes del demo (material a reemplazar al vender).
  /^DEMO\.md$/i,
  /^\.qa\//,
  /^pnpm-lock\.yaml$/,
]

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
        "true = commit WIP intermedio pusheado al remoto: NO requiere validate/build/QA verdes (es WIP por definición — pushea aunque todo esté roto). Mensaje prefijado 'wip:'. Working tree limpio es no-op, no error.",
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
    // Guard anti-motor (solo push FINAL): los cambios deben vivir en las
    // superficies del contrato. Motor tocado = el agente adaptó el template
    // a una config inventada (bucle clásico) — se rechaza con la lista.
    if (!checkpoint) {
      // Working tree + lo ya commiteado en la rama (checkpoints previos
      // pudieron traer motor tocado): todo se compara contra main.
      const changed = await sandbox.run({
        command: `cd site && git fetch -q origin main 2>/dev/null; git diff origin/main --name-only 2>/dev/null; git status --porcelain`,
      })
      const touched = changed.stdout
        .split("\n")
        .map((line) => {
          // Línea porcelain ("XY path") o de diff (path puro).
          const path = /^[A-Z?! ]{2} /.test(line) ? line.slice(3) : line
          const trimmed = path.trim()
          // Renames: "R  viejo -> nuevo" — cuenta el destino.
          return trimmed.includes(" -> ")
            ? trimmed.split(" -> ")[1]
            : trimmed
        })
        .filter(Boolean)
      const engineTouched = touched.filter(
        (path) => !EDITABLE_PATHS.some((re) => re.test(path)),
      )
      if (engineTouched.length > 0) {
        throw new Error(
          `Push rechazado: modificaste ${engineTouched.length} archivo(s) del MOTOR del template (prohibido por contrato): ${engineTouched.slice(0, 12).join(", ")}. El motor nunca se adapta a tu config — tu config se adapta al motor (lib/config.ts es la fuente de verdad). Revierte con \`git checkout -- <archivos>\` (o corre reset_site_repo si el motor quedó irreconocible), ajusta site.config.ts/es.json al schema real y vuelve a build.`,
        )
      }
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

    // site/.agent es tooling del sandbox (skills/config del coding agent),
    // jamás parte del sitio del cliente: se excluye del repo y se destraquea
    // si una corrida anterior lo commiteó por accidente.
    await sandbox.run({
      command: `cd site && mkdir -p .git/info && (grep -qxF '.agent/' .git/info/exclude 2>/dev/null || echo '.agent/' >> .git/info/exclude) && (git rm -r -q --cached .agent 2>/dev/null; true)`,
    })

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
