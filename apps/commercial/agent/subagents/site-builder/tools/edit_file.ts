import { defineTool } from "eve/tools"
import { z } from "zod"

/**
 * Editor por DIFF (str_replace): parcha un archivo EXISTENTE sustituyendo un
 * fragmento exacto por otro, en vez de re-emitir el archivo completo. El output
 * del modelo cae de miles de tokens (heredoc/write_file del archivo entero) a
 * decenas (solo el fragmento) — y el output de Sonnet es ~5x el precio del
 * input, así que es la palanca de costo más grande del modo edit.
 *
 * Reemplaza el patrón frágil de "replace de python por bash" que sugerían los
 * hints (el escape de comillas/saltos lo rompía → reintentos que queman
 * tokens). NO crea archivos (usa write_file). NO toca superficies pass-through
 * (es.json/site-config): ésas se recomponen con draft_surface.
 *
 * Sustitución LITERAL vía indexOf/slice y split/join — nunca String.replace,
 * cuyos patrones `$&`/`$1` corromperían el código del sitio (lleno de `${…}`).
 */
export default defineTool({
  description:
    "Edita por DIFF un archivo EXISTENTE del sitio en el sandbox: sustituye `oldString` (fragmento textual EXACTO, con su indentación y saltos) por `newString`. ÚSALO SIEMPRE para cambios PUNTUALES sobre código/contenido ya escrito EN VEZ de re-emitir el archivo entero por heredoc/write_file/draft_surface — ahorra ~90% de tokens de salida. Sirve para CUALQUIER archivo existente: una sección components/custom, registry.ts, un import, una clase Tailwind, y también un valor puntual en messages/es.json o site.config.ts (p. ej. corregir un teléfono, un typo, una frase — el hot path de las ediciones copyOnly). `oldString` debe ser ÚNICO (añade líneas de contexto si el fragmento se repite) o pasa replaceAll:true. Falla si el archivo no existe (usa write_file), si `oldString` no aparece, o si aparece >1 vez sin replaceAll. Para COMPONER una superficie COMPLETA de cero (build inicial, o cambio estructural que toca muchas keys/namespaces del es.json) usa draft_surface, no esto: draft_surface valida el espejo config↔copy y que no sobreviva el demo. Tras editar es.json/config corre `pnpm validate-config`.",
  inputSchema: z.object({
    path: z
      .string()
      .regex(/^[\w./-]+$/)
      .describe(
        "Ruta relativa al repo clonado, p. ej. 'components/custom/HeroSplit.tsx'.",
      ),
    oldString: z
      .string()
      .min(1)
      .describe(
        "Fragmento EXACTO a reemplazar, copiado verbatim del archivo (misma indentación, mismos saltos de línea). Único en el archivo salvo replaceAll.",
      ),
    newString: z
      .string()
      .describe(
        "Texto que sustituye a oldString. Cadena vacía = borrar el fragmento.",
      ),
    replaceAll: z
      .boolean()
      .optional()
      .describe(
        "true = reemplaza TODAS las ocurrencias (renombrar un símbolo repetido). Por defecto exige que oldString sea único.",
      ),
  }),
  async execute({ path, oldString, newString, replaceAll }, ctx) {
    // Acepta absolutas que caen bajo el root del clone (el modelo a veces pega
    // la ruta completa /workspace/site/...): normalízalas a relativas.
    for (const rootPrefix of ["/workspace/site/", "/workspace/", "site/"]) {
      if (path.startsWith(rootPrefix)) {
        path = path.slice(rootPrefix.length)
        break
      }
    }
    if (path.includes("..") || path.startsWith("/")) {
      throw new Error("Ruta inválida: debe caer bajo /workspace/site, sin '..'.")
    }
    if (oldString === newString) {
      throw new Error(
        "oldString y newString son idénticos: no hay nada que cambiar.",
      )
    }
    const sandbox = await ctx.getSandbox()
    const full = `site/${path}`
    const current = await sandbox.readTextFile({ path: full })
    if (current == null) {
      throw new Error(
        `El archivo ${full} no existe: edit_file solo parcha archivos existentes. Para uno nuevo usa write_file.`,
      )
    }

    // Conteo literal (split, no regex: oldString puede traer metacaracteres).
    const occurrences = current.split(oldString).length - 1
    if (occurrences === 0) {
      throw new Error(
        `No encontré oldString en ${full}. Debe ser un fragmento TEXTUAL exacto (misma indentación y saltos). Lee el archivo (read_file) y copia el fragmento verbatim.`,
      )
    }
    if (occurrences > 1 && !replaceAll) {
      throw new Error(
        `oldString aparece ${occurrences} veces en ${full}: no es único. Añade líneas de contexto alrededor para desambiguar, o pasa replaceAll:true para cambiar todas.`,
      )
    }

    // Reemplazo LITERAL (nunca String.replace: interpreta `$&`/`$1` en newString).
    let next: string
    if (replaceAll) {
      next = current.split(oldString).join(newString)
    } else {
      const idx = current.indexOf(oldString)
      next = current.slice(0, idx) + newString + current.slice(idx + oldString.length)
    }

    await sandbox.writeTextFile({ path: full, content: next })
    return {
      path: full,
      replacements: replaceAll ? occurrences : 1,
      bytes: next.length,
      hint: "Parche aplicado por diff. Verifica con `pnpm build`/`pnpm validate-config`. Para más cambios en el mismo archivo, vuelve a llamar edit_file — NO re-emitas el archivo completo.",
    }
  },
})
