import { defineTool } from "eve/tools"
import { z } from "zod"

/**
 * Ensambla `components/custom/registry.ts` de forma DETERMINISTA — cero modelo.
 *
 * El registro es 100% derivable: las keys `component` de site.config.ts +
 * el export de cada `components/custom/<key>.tsx`. Antes lo escribía el modelo
 * a mano al final del build; era el paso mecánico donde un modelo barato
 * (qwen) bajaba los brazos y PREGUNTABA al humano ("hay 8 secciones, ¿qué
 * hago?") en vez de actuar, o metía imports rotos / named-vs-default
 * (los errores que la instrucción del paso 8 lista como típicos). Sacarlo del
 * modelo elimina esa clase entera de fallo y ese momento de bail.
 *
 * Contrato que preserva (sin él el section-renderer del motor no compila en
 * repos viejos): `export const customSections: Record<string, ComponentType<{
 * ns: string }>> = {...}`.
 *
 * Si una key del config no tiene archivo, NO escribe un registry roto: lanza
 * con la lista exacta para que el agente escriba esas customs (hueco de
 * fan-out) y re-llame. Registra EXACTAMENTE el conjunto referenciado por el
 * config (dedup) — nada de secciones huérfanas del demo.
 */

/** hero-expediente → HeroExpediente (fallback de nombre si hace falta). */
function kebabToPascal(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("")
}

type Export = { name: string; isDefault: boolean }

/** Detecta el componente exportado de una custom (named PascalCase preferido). */
function findComponentExport(source: string): Export | null {
  // Named exports en PascalCase (el convenio de las customs). Primero el que
  // aparezca: `export function Hero(...)` o `export const Hero = (...)`.
  const named = [
    /export\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/g,
  ]
  for (const re of named) {
    const m = re.exec(source)
    if (m) return { name: m[1], isDefault: false }
  }
  // Default con nombre: `export default function Hero(`.
  const defNamed = /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/.exec(
    source,
  )
  if (defNamed) return { name: defNamed[1], isDefault: true }
  // Default de un identificador ya declarado: `export default Hero`.
  const defIdent = /export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*;?\s*$/m.exec(
    source,
  )
  if (defIdent) return { name: defIdent[1], isDefault: true }
  // Default anónimo: `export default function(` / `export default (props)=>`.
  if (/export\s+default\s+(?:function\b|\()/.test(source)) {
    return { name: "", isDefault: true }
  }
  return null
}

export default defineTool({
  description:
    "Ensambla components/custom/registry.ts de forma DETERMINISTA (sin modelo) a partir de las keys `component` de site.config.ts y el export de cada custom. ÚSALO en vez de escribir/editar registry.ts a mano tras materializar las secciones: elimina imports rotos, named-vs-default y customs sin registrar. Registra exactamente el conjunto de componentes que el config referencia (home + páginas, deduplicado). Si falta el archivo de alguna key, NO escribe un registry roto: te devuelve la lista de customs faltantes para que las escribas (con draft_section o a mano) y re-llames. Corre `pnpm validate-config` después.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const sandbox = await ctx.getSandbox()

    const config = await sandbox.readTextFile({ path: "site/site.config.ts" })
    if (config == null) {
      throw new Error(
        "No encontré site/site.config.ts en el sandbox. Clona el repo (clone_site_repo) y compón el config antes de ensamblar el registry.",
      )
    }

    // Keys referenciadas por el config (home `sections` + `pages[].sections`).
    // Dedup preservando el primer orden de aparición (orden de render).
    const keys: string[] = []
    const seen = new Set<string>()
    const keyRe = /component:\s*["']([^"']+)["']/g
    for (let m = keyRe.exec(config); m; m = keyRe.exec(config)) {
      const key = m[1]
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
    if (keys.length === 0) {
      throw new Error(
        'site.config.ts no referencia ninguna sección custom (no hallé `component: "…"`). Revisa que `sections` esté poblado antes de ensamblar.',
      )
    }

    // Resuelve el export de cada key. Acumula faltantes en vez de fallar al
    // primero: el reporte completo evita ping-pong.
    const missing: string[] = []
    const anonymous: string[] = []
    const resolved: { key: string; exp: Export }[] = []
    for (const key of keys) {
      const source = await sandbox.readTextFile({
        path: `site/components/custom/${key}.tsx`,
      })
      if (source == null) {
        missing.push(key)
        continue
      }
      const exp = findComponentExport(source)
      if (!exp) {
        missing.push(key)
        continue
      }
      if (!exp.name) {
        // Default anónimo: import default con nombre derivado de la key.
        anonymous.push(key)
        resolved.push({ key, exp: { name: kebabToPascal(key), isDefault: true } })
        continue
      }
      resolved.push({ key, exp })
    }

    if (missing.length > 0) {
      throw new Error(
        `No escribí el registry: faltan (o no exportan un componente) estas customs referenciadas por site.config.ts:\n` +
          missing.map((k) => `  - components/custom/${k}.tsx`).join("\n") +
          `\n\nEscríbelas (draft_section para diseño, o a mano) con un export de componente en PascalCase y re-llama assemble_registry. NO edites registry.ts a mano ni preguntes al humano: escribir las customs faltantes es tu trabajo.`,
      )
    }

    // Desambigua nombres colisionados (dos archivos con el mismo export) con
    // alias derivado de la key — el registry monta por key, el nombre local da igual.
    const usedNames = new Set<string>()
    const rows = resolved.map(({ key, exp }) => {
      let local = exp.name
      if (usedNames.has(local)) local = kebabToPascal(key)
      let alias = local
      let n = 2
      while (usedNames.has(alias)) alias = `${local}${n++}`
      usedNames.add(alias)
      const importStmt = exp.isDefault
        ? `import ${alias} from "./${key}";`
        : exp.name === alias
          ? `import { ${exp.name} } from "./${key}";`
          : `import { ${exp.name} as ${alias} } from "./${key}";`
      return { key, alias, importStmt }
    })

    // Imports ordenados por alias (determinista); el map en orden de render.
    const imports = [...rows]
      .sort((a, b) => a.alias.localeCompare(b.alias))
      .map((r) => r.importStmt)
      .join("\n")
    const entries = rows.map((r) => `  "${r.key}": ${r.alias},`).join("\n")

    const content = `import type { ComponentType } from "react";

${imports}

/**
 * Registro de secciones CUSTOM — ENSAMBLADO por assemble_registry (determinista).
 * NO lo edites a mano: re-córrelo tras cambiar site.config.ts o agregar/quitar
 * una custom. Deriva de las keys \`component\` del config + el export de cada
 * components/custom/<key>.tsx. El tipo es el contrato del motor.
 */
export const customSections: Record<string, ComponentType<{ ns: string }>> = {
${entries}
};
`

    await sandbox.writeTextFile({
      path: "site/components/custom/registry.ts",
      content,
    })

    return {
      path: "site/components/custom/registry.ts",
      registered: rows.map((r) => r.key),
      count: rows.length,
      ...(anonymous.length > 0
        ? {
            note: `Estas customs exportan default anónimo — las importé como default con nombre derivado de la key: ${anonymous.join(", ")}. Prefiere un export nombrado en PascalCase.`,
          }
        : {}),
      hint: "Registry ensamblado sin modelo. Corre `pnpm validate-config` para confirmar el espejo config↔registry↔copy, luego `build_check`.",
    }
  },
})
