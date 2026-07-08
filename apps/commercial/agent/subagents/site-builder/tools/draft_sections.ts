import { defineTool } from "eve/tools"
import { z } from "zod"

import { draftOneSection } from "./draft_section"

/**
 * Dibuja VARIAS secciones custom EN PARALELO (una llamada, N secciones). Cada
 * sección es un `generateText` single-shot independiente → paralelizarlas corta
 * el wall-clock de N×latencia a ~1×latencia. MEDIDO en prod: draft_section tarda
 * ~60s/sección con deepseek; un sitio de ~9-17 secciones en serie son 9-17 min
 * de puro dibujado. Esto lo colapsa a ~1-2 min.
 *
 * Determinista (no depende de que el orquestador batchee N tool-calls). Reusa el
 * MISMO core (`draftOneSection`) que draft_section: mismas REGLAS DURAS,
 * validación con reintento, contratos del template e instrumentación. Limita la
 * concurrencia para no reventar el rate-limit del provider (429 → backoff que
 * re-serializa y mata la ganancia).
 *
 * Úsalo en el build INICIAL (paso 7) para materializar TODAS las secciones de
 * una vez. Las que fallen (no validan ni con reintento) vuelven en `failed`:
 * escríbelas a mano con las tools del sandbox o re-llama draft_section una a una.
 * Después ensambla con assemble_registry y corre build_check.
 */

const CONCURRENCY = 5

/** Ejecuta `fn` sobre `items` con un tope de tareas concurrentes. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export default defineTool({
  description:
    "Dibuja VARIAS secciones custom EN PARALELO en UNA sola llamada — la versión plural de draft_section. Úsalo en el paso 7 del build INICIAL para materializar TODAS las secciones de una vez en vez de N llamadas seriales a draft_section (cada sección es single-shot, ~60s; paralelizarlas colapsa N×60s a ~1-2 min). Mismo contrato que draft_section por sección (Section, tokens, Reveal, SmartImage, next-intl, export PascalCase); valida con reintento. Devuelve `written` (las que quedaron) y `failed` (las que no validaron: escríbelas a mano o re-llama draft_section una a una). Luego assemble_registry + build_check. NO es para superficies mecánicas (draft_surface) ni parches (edit_file).",
  inputSchema: z.object({
    sections: z
      .array(
        z.object({
          path: z
            .string()
            .regex(/^[\w./-]+$/)
            .describe(
              "Ruta de la custom, p. ej. 'components/custom/hero-expediente.tsx'.",
            ),
          component: z
            .string()
            .regex(/^[A-Z][A-Za-z0-9_]*$/)
            .describe("Nombre del componente en PascalCase, casa con el archivo."),
          ns: z.string().describe("Namespace de next-intl de la sección."),
          archetype: z
            .string()
            .describe("Arquetipo estructural (uno, explícito)."),
          brief: z
            .string()
            .min(40)
            .describe(
              "El diseño CONCRETO de ESTA sección (layout, keys de copy, imágenes, gestos). Puede incluir un 'BASE A ADAPTAR:' de reference/.",
            ),
          isSlot: z
            .boolean()
            .optional()
            .describe("true para header/footer (slot)."),
          useClient: z
            .boolean()
            .optional()
            .describe('true si necesita "use client".'),
        }),
      )
      .min(1)
      .max(24)
      .describe(
        "Todas las secciones a dibujar en paralelo. Una entrada por sección, con su path/component/ns/archetype/brief.",
      ),
  }),
  async execute({ sections }, ctx) {
    const settled = await mapLimit(sections, CONCURRENCY, async (section) => {
      try {
        const res = await draftOneSection(section, ctx)
        return { ok: true as const, res }
      } catch (e) {
        return {
          ok: false as const,
          path: section.path,
          component: section.component,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    })

    const written = settled
      .filter((s): s is { ok: true; res: Awaited<ReturnType<typeof draftOneSection>> } => s.ok)
      .map((s) => s.res)
    const failed = settled
      .filter((s): s is { ok: false; path: string; component: string; error: string } => !s.ok)
      .map(({ path, component, error }) => ({ path, component, error }))

    return {
      writtenCount: written.length,
      failedCount: failed.length,
      written: written.map((w) => ({ path: w.path, component: w.component, ns: w.ns })),
      failed,
      hint:
        failed.length === 0
          ? "Todas las secciones escritas y validadas. Corre assemble_registry (determinista) y luego build_check."
          : `Faltan ${failed.length} sección(es) que no validaron (ver \`failed\`): escríbelas a mano con las tools del sandbox (aplicando taste + anti-generic) o re-llama draft_section una a una. Luego assemble_registry + build_check.`,
    }
  },
})
