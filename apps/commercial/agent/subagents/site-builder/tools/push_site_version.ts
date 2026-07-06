import { defineTool } from "eve/tools"
import { z } from "zod"

import { addActivity } from "../../../lib/leads"
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

/**
 * Superficies que NO alteran el render: solo texto/manifiestos. Un edit que
 * toca EXCLUSIVAMENTE estas puede saltar el QA visual (copyOnly) — el pixel
 * no cambia de forma/estructura, solo el contenido de las cadenas. Cualquier
 * .tsx/theme/fonts/config/imagen queda FUERA: eso sí mueve el layout.
 */
const COPY_SAFE_PATHS: RegExp[] = [/^messages\/.*\.json$/, /^DEMO\.md$/i, /^CHANGELOG/i]

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
    overrideReview: z
      .boolean()
      .default(false)
      .describe(
        "Escape hatch del gate de review visual: solo tras 2 rediseños REALES en los que review_screenshots siguió sin aprobar por CRITERIO subjetivo (approved:false o critical de axis 'aesthetic': contraste mejorable, estética). Entrega el sitio pese al veredicto y lo anota. NO salta criticals de axis 'structural' (algo ROTO: overflow, texto cortado, imagen faltante) — esos se corrigen siempre. Nunca en el primer intento.",
      ),
    copyOnly: z
      .boolean()
      .default(false)
      .describe(
        "Edit de SOLO texto (corregir un typo, reescribir una frase, cambiar un teléfono/href de contacto): salta el QA visual (screenshots + review_screenshots), lo más caro del flujo. El tool VERIFICA el claim — el diff vs main debe tocar EXCLUSIVAMENTE messages/*.json (o DEMO.md/CHANGELOG); si tocaste cualquier .tsx/theme/fonts/config/imagen, se rechaza y exige el review normal. validate-config SIEMPRE corre (mantiene el espejo config<->copy). Úsalo SOLO en modo edit y SOLO para cambios que no mueven el layout: NO para agregar/quitar secciones o ítems de lista (eso cambia el render → review normal).",
      ),
  }),
  async execute(
    { siteId, versionN, commitMessage, checkpoint, overrideReview, copyOnly },
    ctx,
  ) {
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

    // Archivos que difieren de origin/main (working tree + nuevos sin
    // trackear), excluyendo `.agent/` (tooling del sandbox, no del sitio). Lo
    // usa el check de copyOnly para verificar que un edit "de solo texto" no
    // tocó ninguna superficie visual.
    const changedVsMain = async (): Promise<string[]> => {
      const changed = await sandbox.run({
        command: `cd site && git fetch -q origin main 2>/dev/null; git diff origin/main --name-only 2>/dev/null; git status --porcelain`,
      })
      return changed.stdout
        .split("\n")
        .flatMap((line) => {
          const isPorcelain = /^[A-Z?! ]{2} /.test(line)
          if (isPorcelain) {
            if (!line.startsWith("??")) return []
            const p = line.slice(3).trim()
            return p ? [p.includes(" -> ") ? p.split(" -> ")[1] : p] : []
          }
          const p = line.trim()
          return p ? [p] : []
        })
        .filter(Boolean)
        .filter((p) => !p.startsWith(".agent/"))
    }

    const escaped = commitMessage.replace(/"/g, '\\"')
    // Issues del review que se entregan pese al veredicto (overrideReview): se
    // anotan tras el push para José y el modo edit/publish.
    let openIssues: string[] = []
    // ¿Hay cambios sin commitear en el working tree?
    const dirty = await sandbox.run({
      command: `cd site && git status --porcelain | head -1`,
    })
    const hasChanges = Boolean(dirty.stdout.trim())
    if (!hasChanges) {
      if (checkpoint) {
        // Checkpoint sin cambios nuevos: no-op amistoso.
        const sha = await sandbox.run({ command: `cd site && git rev-parse HEAD` })
        return { branch, commitSha: sha.stdout.trim(), skipped: true }
      }
      // Push FINAL con working tree limpio: NO es error si la rama ya trae el
      // trabajo materializado en checkpoints previos (el caso normal cuando el
      // agente hizo checkpoint justo antes de entregar). Solo es error si la
      // rama no tiene NADA sobre main (de verdad no se materializó nada).
      const ahead = await sandbox.run({
        command: `cd site && git fetch -q origin main 2>/dev/null; git rev-list origin/main..HEAD --count 2>/dev/null || echo 0`,
      })
      if ((parseInt(ahead.stdout.trim(), 10) || 0) === 0) {
        throw new Error(
          "No hay nada que entregar: el working tree está limpio y la rama no tiene commits sobre main. ¿Aplicaste la personalización sobre el clone? (Si el run anterior murió sin pushear, su trabajo se perdió con su sandbox: re-materializa el spec vigente antes de pushear.)",
        )
      }
      // Hay trabajo commiteado en la rama: se corre el resto de gates y se
      // entrega ese estado (sin re-commitear nada).
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
        .flatMap((line) => {
          // Dos fuentes en el mismo stdout:
          //  - `git diff origin/main --name-only`: rutas puras. Compara el
          //    WORKING TREE contra main, así que YA refleja el contenido final
          //    (incluido lo commiteado en checkpoints). Un archivo revertido a
          //    main con `git checkout origin/main -- <f>` NO aparece aquí.
          //  - `git status --porcelain`: líneas "XY path". De aquí SOLO cuentan
          //    los archivos NUEVOS sin trackear ("??"); los "M "/" M" (incluida
          //    la REVERSIÓN staged de un checkpoint) ya los cubre el diff por
          //    contenido — contarlos re-marcaba como "motor tocado" un archivo
          //    ya revertido a main → loop infinito (Copper Wolf no pudo entregar).
          const isPorcelain = /^[A-Z?! ]{2} /.test(line)
          if (isPorcelain) {
            if (!line.startsWith("??")) return []
            const p = line.slice(3).trim()
            return p ? [p.includes(" -> ") ? p.split(" -> ")[1] : p] : []
          }
          const p = line.trim()
          return p ? [p] : []
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
      // copyOnly: edit de SOLO texto. Verifica que el diff vs main toque
      // EXCLUSIVAMENTE copy (messages/*.json, DEMO.md, CHANGELOG); si algo
      // visual cambió, el claim se rechaza y se exige el review normal.
      // Verificado → se saltan el qa-report y el review (lo caro): un cambio
      // de solo texto no altera la forma del render. validate-config ya corrió
      // arriba y mantiene el espejo config<->copy.
      if (copyOnly) {
        const nonCopy = (await changedVsMain()).filter(
          (p) => !COPY_SAFE_PATHS.some((re) => re.test(p)),
        )
        if (nonCopy.length > 0) {
          throw new Error(
            `copyOnly rechazado: el diff vs main toca ${nonCopy.length} archivo(s) que SÍ afectan el render (${nonCopy.slice(0, 8).join(", ")}). copyOnly es solo para cambios de TEXTO en messages/*.json — corre \`pnpm qa\` + \`review_screenshots\` y vuelve a pushear SIN copyOnly.`,
          )
        }
      }
      // Pasos 2 y 3 (qa-report + review visual) SOLO cuando NO es copyOnly:
      // un cambio de solo texto no puede alterar la forma del render, así que
      // no hay nada nuevo que capturar ni juzgar con visión.
      if (!copyOnly) {
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
      // 3. Gate de REVIEW visual: review_screenshots deja su veredicto en
      //    site/.qa/review.json. Un review approved:false (monotonía, 2+ major)
      //    o CUALQUIER issue critical BLOQUEA el push — antes solo advertía y un
      //    sitio genérico se entregaba igual. Escape hatch: overrideReview:true
      //    (solo tras rediseños reales; nunca salta criticals).
      const reviewRead = await sandbox.run({
        command: `cat site/.qa/review.json 2>/dev/null || echo ""`,
      })
      let review: {
        approved?: boolean
        verdict?: string
        issues?: Array<{
          severity?: string
          axis?: string
          issue?: string
          screen?: string
        }>
      } | null = null
      try {
        const txt = reviewRead.stdout.trim()
        if (txt) review = JSON.parse(txt)
      } catch {
        review = null
      }
      if (!review) {
        throw new Error(
          `Push rechazado: no hay veredicto de review visual (site/.qa/review.json). Después de \`pnpm qa\` corre \`review_screenshots\` (director de arte con visión) y deja que juzgue los screenshots ANTES del push final. Sin ese ojo independiente no se entrega.`,
        )
      }
      const issues = Array.isArray(review.issues) ? review.issues : []
      const criticals = issues.filter((i) => i?.severity === "critical")
      const majors = issues.filter((i) => i?.severity === "major")
      // El critical se separa por AXIS: "structural" = algo ROTO objetivo
      // (overflow, texto cortado, imagen faltante) — bloqueo DURO que ni
      // overrideReview salta. "aesthetic" = criterio subjetivo (contraste
      // mejorable, estética) — NO bloquea de forma absoluta: cuenta como el
      // gate de calidad (approved:false), overridable tras pasadas reales. Un
      // critical sin axis se trata como structural (fail-safe). Esto mata el
      // loop que dejaba el sitio inentregable por un critical subjetivo
      // distinto por pasada (Almex: 3 pasadas, critical nuevo cada vez; el dark
      // de un sitio light-only).
      const structuralCriticals = criticals.filter(
        (i) => (i?.axis ?? "structural") === "structural",
      )
      if (!overrideReview) {
        if (structuralCriticals.length > 0) {
          throw new Error(
            `Push rechazado: el review encontró ${structuralCriticals.length} issue(s) CRITICAL ESTRUCTURAL (algo ROTO, no estético):\n- ${structuralCriticals
              .map((i) => `${i.screen ?? "?"}: ${i.issue ?? ""}`)
              .join("\n- ")}\nCorrígelos (overflow, texto cortado, imagen faltante), re-corre \`pnpm qa\` + \`review_screenshots\`, y vuelve a pushear. Esto NO se overridea — está roto de verdad.`,
          )
        }
        if (review.approved === false) {
          const aesthetic = [
            ...criticals.filter((i) => i?.axis === "aesthetic"),
            ...majors,
          ]
          throw new Error(
            `Push rechazado: el review visual NO aprobó el sitio (${review.verdict ?? "sin veredicto"}). ${aesthetic.length} problema(s) de diseño:\n- ${aesthetic
              .map((i) => `${i.screen ?? "?"}: ${i.issue ?? ""}`)
              .join("\n- ")}\nRecompón (rompe la monotonía, sube la jerarquía, mete una custom) y re-corre el flujo. Si YA hiciste 2 rediseños reales y el review sigue sin aprobar por CRITERIO (no por algo roto), pushea con overrideReview:true — queda anotado.`,
          )
        }
      } else if (structuralCriticals.length > 0) {
        // overrideReview NO salta lo estructuralmente roto: se rechaza igual.
        throw new Error(
          `overrideReview NO salta criticals ESTRUCTURALES (algo roto de verdad):\n- ${structuralCriticals
            .map((i) => `${i.screen ?? "?"}: ${i.issue ?? ""}`)
            .join("\n- ")}\nCorrige eso primero; el override es solo para veredictos subjetivos.`,
        )
      } else if (criticals.length > 0 || review.approved === false) {
        // Entrega forzada con issues estéticos/subjetivos: deja constancia.
        openIssues = [...criticals, ...majors]
          .map((i) => `[${i.severity}] ${i.screen ?? "?"}: ${i.issue ?? ""}`)
          .slice(0, 12)
      }
      } // fin if (!copyOnly): fin de los gates de qa-report + review visual
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
    // Si no hay cambios sin commitear (push final tras un checkpoint), NO se
    // commitea — se entrega el HEAD que ya trae el trabajo. `git commit` sin
    // cambios falla y tumbaría el `&&` (el bug que dejó Almex sin entregar).
    const commitStep = hasChanges
      ? `git add -A && git commit -m "${message}" && `
      : ``
    const push = await sandbox.run({
      command: `cd site && git checkout -B ${branch} && ${commitStep}git push -f origin ${branch}`,
    })
    if (push.exitCode !== 0) {
      throw new Error(
        `git push falló (exit ${push.exitCode}):\n${[push.stderr, push.stdout].filter(Boolean).join("\n").slice(-1200)}`,
      )
    }

    const sha = await sandbox.run({ command: `cd site && git rev-parse HEAD` })
    // Entrega forzada con issues abiertos (overrideReview): queda en el historial
    // del lead para que José lo vea antes de publicar.
    if (openIssues.length > 0) {
      try {
        await addActivity({
          leadId: site.lead_id,
          type: "site_version_created",
          note: `v${versionN}: PREVIEW entregado con overrideReview pese a ${openIssues.length} issue(s) de review abiertos:\n- ${openIssues.join("\n- ")}`,
          actor: "site-builder",
        })
      } catch {
        // best-effort: no tumbar la entrega por el registro
      }
      return { branch, commitSha: sha.stdout.trim(), deliveredWithOpenIssues: openIssues }
    }
    return { branch, commitSha: sha.stdout.trim() }
  },
})
