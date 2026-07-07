import { defineHook } from "eve/hooks"

import { getSupabaseClient } from "./supabase"

/**
 * Fábrica de hooks de USO/costo. Cada agente monta uno (en agent/hooks/ y en
 * el hooks/ de cada subagente): los hooks de subagente solo ven su propio
 * scope, por eso hace falta uno por agente. Captura:
 *  - `step.completed` → tokens de cada llamada al modelo → tabla token_usage.
 *  - `message.received` → parsea el tag [Contexto: lead X / site Y] de la
 *    delegación → mapea la sesión al lead/site (tabla session_context).
 * Best-effort SIEMPRE: un hook que lanza tumba el turn.
 */

const CONTEXT_RE = /\[Contexto:\s*(lead|site)\s+([0-9a-fA-F-]{36})\]/

/** Modelo real del site-builder (mismo toggle que agent.ts). */
export function siteBuilderModel(): string {
  const toggle: Record<string, string> = {
    gpt: "gpt-5.4",
    "gpt-mini": "gpt-5.4-mini",
  }
  return toggle[process.env.SITE_BUILDER_MODEL ?? ""] ?? "claude-sonnet-5"
}

/**
 * Modelo real del art-director (mismo toggle que su agent.ts). El default pasó
 * a claude-sonnet-5 (art-director = cerebro de composición); el hook de usage
 * debe reflejarlo o la tabla de costo lo pinta con el modelo viejo.
 */
export function artDirectorModel(): string {
  return process.env.ART_DIRECTOR_MODEL === "gpt" ? "gpt-5.4" : "claude-sonnet-5"
}

export function makeUsageHook(agent: string, model: string) {
  return defineHook({
    events: {
      async "message.received"(event, ctx) {
        try {
          const message = (event.data as { message?: unknown })?.message
          const text = typeof message === "string" ? message : ""
          const m = CONTEXT_RE.exec(text)
          if (!m) return
          const patch =
            m[1].toLowerCase() === "lead"
              ? { lead_id: m[2] }
              : { site_id: m[2] }
          await getSupabaseClient()
            .from("session_context")
            .upsert(
              {
                session_id: ctx.session.id,
                ...patch,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "session_id" },
            )
        } catch {
          // best-effort
        }
      },
      async "step.completed"(event, ctx) {
        try {
          const data = event.data as {
            turnId?: string
            usage?: {
              inputTokens?: number
              outputTokens?: number
              cacheReadTokens?: number
            }
          }
          const usage = data?.usage
          if (!usage) return
          const input = usage.inputTokens ?? 0
          const output = usage.outputTokens ?? 0
          if (input === 0 && output === 0) return
          await getSupabaseClient().from("token_usage").insert({
            session_id: ctx.session.id,
            turn_id: data.turnId ?? null,
            agent,
            model,
            input_tokens: input,
            output_tokens: output,
            cache_read_tokens: usage.cacheReadTokens ?? 0,
          })
        } catch {
          // best-effort
        }
      },
      // Atribuye cada step a su(s) tool(s): sin esto token_usage sabe CUÁNTO
      // cuesta un step pero no QUÉ hizo. Con esto un build real dice qué tools
      // se llevan los ~43-55% de steps mecánicos (bash de QA/build vs edit_file
      // vs draft_surface) → dónde colapsar. Una fila por acción; best-effort.
      async "actions.requested"(event, ctx) {
        try {
          const actions = event.data?.actions
          if (!actions?.length) return
          const rows = actions.map((a) => ({
            session_id: ctx.session.id,
            agent,
            tool_name: a.kind === "tool-call" ? a.toolName : a.kind,
            kind: a.kind,
            step_index: event.data.stepIndex ?? null,
          }))
          await getSupabaseClient().from("tool_calls").insert(rows)
        } catch {
          // best-effort
        }
      },
    },
  })
}
