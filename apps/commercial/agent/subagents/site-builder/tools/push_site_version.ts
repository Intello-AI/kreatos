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
        (path) =>
          // `.agent/` es tooling del coding-agent (skills/config del sandbox),
          // NUNCA parte del sitio del cliente: se excluye del repo más abajo
          // (git rm --cached). El runtime de eve lo re-siembra en cada corrida,
          // así que aparece como modificado/borrado vs origin/main — pero eso
          // no es tocar el MOTOR del template. Sin este filtro, el guard lo
          // marcaba y el push entraba en un loop irreparable.
          !path.startsWith(".agent/") &&
          !EDITABLE_PATHS.some((re) => re.test(path)),
      )
      if (engineTouched.length > 0) {
        const list = engineTouched.slice(0, 12).join(" ")
        throw new Error(
          `Push rechazado: modificaste ${engineTouched.length} archivo(s) del MOTOR del template (prohibido por contrato): ${engineTouched.slice(0, 12).join(", ")}.\n\n` +
            `RECOVERY SELECTIVO (haz ESTO — NO borres tu trabajo):\n` +
            `1. Revierte SOLO esos archivos de motor a su estado original — funciona aunque los hayas commiteado en un checkpoint:\n` +
            `     cd site && git checkout origin/main -- ${list}\n` +
            `   (\`git checkout -- <archivo>\` NO basta si el cambio ya entró en un checkpoint: usa \`origin/main --\` para traer la versión del motor limpio.)\n` +
            `2. Si la sección que parchaste requería un layout que el motor no soporta (p. ej. un contact "footer-hero"), NO re-parches el motor: créala como CUSTOM en components/custom/<nombre>.tsx, regístrala y decláralala en config como { id: "custom", component, ns }. El motor nunca se adapta a tu config; tu config y tus customs se adaptan al motor (lib/config.ts es la fuente de verdad).\n` +
            `3. Re-corre pnpm build y vuelve a pushear. TODO tu trabajo custom/config/copy sigue intacto — solo revertiste el motor.\n\n` +
            `PROHIBIDO usar reset_site_repo aquí: borra TODO el working tree y tira tu trabajo bueno. reset_site_repo es SOLO para un motor desactualizado/irreconocible, no para revertir unos archivos concretos que el guard ya te listó arriba.`,
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
      // El copy del demo vive en es.json, no solo en el config: un sitio
      // "maquillado" pasa el check del config y entrega el despacho contable
      // con el logo del cliente (pasó dos veces).
      const esJson =
        (await sandbox.readTextFile({ path: "site/messages/es.json" })) ?? ""
      const esLower = esJson.toLowerCase()
      // Solo firmas ÚNICAS del demo ficticio (nombre + fundador inventado).
      // NUNCA términos del giro ("despacho contable", "buzón tributario"): el
      // cliente real ES un despacho contable y su copy legítimo los usa —
      // banearlos bloqueaba a TODO cliente contable para siempre (Invoice Laguna
      // rebotó 3 pushes por esto).
      const copyResidue = [
        "lópez y asociados",
        "lopez y asociados",
        "ricardo lópez",
      ].filter((signal) => esLower.includes(signal))
      if (copyResidue.length > 0) {
        throw new Error(
          `Push rechazado: messages/es.json aún contiene el COPY del demo contable ficticio (${copyResidue.join(", ")}). Parchar textos sueltos sobre el demo no es materializar: regenera es.json COMPLETO desde el spec con draft_surface (del demo solo sobrevive el namespace common adaptado).`,
        )
      }
      const configLower = config.toLowerCase()
      // Señales del DEMO más allá del nombre: un sed "López y Asociados" →
      // "<negocio>" deja el nombre correcto pero el NAP/rating/social del
      // despacho ficticio — datos FALSOS que el cliente detecta al instante.
      const demoResidue = [
        "lopezyasociados",
        "lopez_ejemplo",
        "8412973650124873215",
        "blvd. independencia 1240",
      ].filter((signal) => configLower.includes(signal))
      if (demoResidue.length > 0) {
        throw new Error(
          `Push rechazado: site.config.ts es el DEMO del template maquillado (residuos: ${demoResidue.join(", ")}). Cambiarle el nombre al demo con sed/replace NO es personalizar: el teléfono, email, dirección, rating y social siguen siendo del despacho ficticio. Re-materializa TODO desde latestSpec (get_site_brief lo trae) — datos del LEAD, no del demo.`,
        )
      }
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

    // Gate de QA (solo push FINAL): el contrato exige validate-config verde y
    // un qa-report guardado para esta versión. En el runtime real el agente se
    // saltó `pnpm qa` entero y pusheó a ciegas — este gate lo hace determinista
    // (no depende de que el modelo se acuerde de correrlo).
    if (!checkpoint) {
      // 1. validate-config: rápido, sin navegador. Caza el espejo config<->copy
      //    (namespaces faltantes/huérfanos como coverage-map.home), el schema,
      //    colores literales en custom, y customs sin registrar.
      const validate = await sandbox.run({
        command: `cd site && pnpm validate-config 2>&1`,
      })
      if (validate.exitCode !== 0) {
        const out = [validate.stdout, validate.stderr]
          .filter(Boolean)
          .join("\n")
          .slice(-1600)
        const missingScript = /validate-config.*not found|Command .*validate-config/i.test(out)
        throw new Error(
          missingScript
            ? `Push rechazado: este clone no tiene el script \`validate-config\` (template viejo). Corre \`reset_site_repo\` y re-materializa desde latestSpec.`
            : `Push rechazado: \`pnpm validate-config\` falló — corrígelo ANTES de pushear (es el mismo check que corre \`pnpm qa\`, pero en segundos y sin navegador):\n${out}`,
        )
      }
      // 2. qa-report guardado para esta versión: prueba de que el QA visual
      //    corrió al menos una vez. El reporte PUEDE anotar screenshots
      //    saltados (navegador no disponible) — eso se admite; lo que no se
      //    admite es pushear sin haber corrido `pnpm qa` + save_qa_report.
      const { getSupabaseClient: getClient } = await import("../../../lib/supabase")
      const { data: versionRow } = await getClient()
        .from("site_versions")
        .select("qa_report")
        .eq("site_id", siteId)
        .eq("version_n", versionN)
        .maybeSingle()
      if (!versionRow?.qa_report) {
        throw new Error(
          `Push rechazado: no hay qa-report guardado para v${versionN}. El QA visual es obligatorio antes del push final: corre el flujo de screenshots + \`pnpm qa\`, lee \`.qa/qa-report.json\` y guárdalo con \`save_qa_report\` (si el navegador del sandbox no está disponible, el reporte lo anota y aun así se guarda). Este gate NO aplica a checkpoint:true.`,
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
