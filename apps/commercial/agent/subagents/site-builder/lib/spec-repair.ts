import { z } from "zod"

/**
 * Reparación Postel de objetos que el modelo emite serializados como string
 * (a veces con comillas simples). Se intenta reparar antes de rechazar; si
 * no se puede, el issue incluye el texto recibido para que el modelo corrija
 * su payload en vez de reintentar a ciegas el mismo.
 */
function repairValue(value: unknown, ctx: z.RefinementCtx, label: string) {
  if (typeof value !== "string") return value
  for (const candidate of [value, value.replace(/'/g, '"')]) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // sigue con el siguiente candidato
    }
  }
  ctx.addIssue({
    code: "custom",
    message: `${label} llegó como STRING en vez de objeto JSON y no se pudo reparar. Reescríbelo como objeto ({"clave": valor, ...}) con comillas dobles, sin serializarlo. Recibido: ${value.slice(0, 300)}`,
  })
  return z.NEVER
}

/** `z.record(string, unknown)` que tolera y repara strings serializados. */
export function repairedRecord(label: string) {
  return z.preprocess(
    (value, ctx) => repairValue(value, ctx, label),
    z.record(z.string(), z.unknown()),
  )
}

/** Igual que `repairedRecord` pero validando contra un schema de objeto propio. */
export function repairedObject<T extends z.ZodType>(label: string, schema: T) {
  return z.preprocess((value, ctx) => repairValue(value, ctx, label), schema)
}
