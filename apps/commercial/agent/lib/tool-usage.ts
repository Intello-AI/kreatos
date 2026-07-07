import { getSupabaseClient } from "./supabase"

/**
 * Registra el usage de una llamada `generateText`/`generateObject` hecha DENTRO
 * de una tool. Estas NO pasan por `step.completed` (son llamadas SDK directas,
 * no turnos del agente) → el hook de usage NUNCA las ve → gasto INVISIBLE
 * (visión gpt-5.1, drafts nano/mini, traducción). Escribe una fila en
 * token_usage con el session_id de la tool —ya mapeado a site/lead en
 * session_context— y el MODELO REAL usado, para que las vistas de costo
 * (lead_cost_by_stage) separen ese gasto del Sonnet del agente en vez de
 * ocultarlo. Best-effort SIEMPRE: la telemetría jamás tumba la tool.
 *
 * Vive aparte de `lib/usage.ts` (que importa `eve/hooks`) para NO arrastrar el
 * runtime de hooks al bundle de una tool — eve empaqueta tools por separado.
 *
 * `usage` es el `result.usage` de la AI SDK: `inputTokens` YA incluye los
 * cached (mismo criterio que la vista corregida fix_cost_cache_doublecount);
 * los cached leídos van aparte para cobrarse a tarifa de cache.
 */
export async function recordToolUsage(
  ctx: { session: { id: string } },
  agent: string,
  model: string,
  usage:
    | {
        inputTokens?: number
        outputTokens?: number
        inputTokenDetails?: { cacheReadTokens?: number }
      }
    | undefined,
): Promise<void> {
  try {
    if (!usage) return
    const input = usage.inputTokens ?? 0
    const output = usage.outputTokens ?? 0
    if (input === 0 && output === 0) return
    await getSupabaseClient().from("token_usage").insert({
      session_id: ctx.session.id,
      turn_id: null,
      agent,
      model,
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    })
  } catch {
    // best-effort: la telemetría nunca rompe el pipeline
  }
}
