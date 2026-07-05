import { defineHook } from "eve/hooks"

import { getSupabaseClient } from "../lib/supabase"

/**
 * Registra en BDD cada pregunta HITL (`input.requested`) para que el
 * dashboard muestre la campana de "preguntas pendientes" sin tener la
 * conversación abierta. Se marcan respondidas cuando la sesión recibe el
 * siguiente mensaje del humano (la respuesta entra por el root), y se
 * limpian si la sesión termina sin respuesta (run muerto).
 * Best-effort SIEMPRE: un hook que lanza tumba el turn.
 */
export default defineHook({
  events: {
    async "input.requested"(event, ctx) {
      try {
        const requests = ((event.data as Record<string, unknown>)?.["requests"] ??
          []) as Array<Record<string, unknown>>
        if (!requests.length) return
        const supabase = getSupabaseClient()
        await supabase.from("pending_inputs").upsert(
          requests.map((request) => ({
            request_id: String(request["requestId"] ?? request["id"] ?? ""),
            session_id: ctx.session.id,
            prompt: String(request["prompt"] ?? ""),
            options: (request["options"] ?? null) as never,
          })),
          { onConflict: "request_id" },
        )
      } catch {
        // observabilidad best-effort: nunca tumbar el turn por esto
      }
    },
    async "message.received"(_event, ctx) {
      try {
        // El humano respondió (mensaje o inputResponses): las preguntas de
        // esta sesión dejan de estar pendientes.
        await getSupabaseClient()
          .from("pending_inputs")
          .update({ responded_at: new Date().toISOString() })
          .eq("session_id", ctx.session.id)
          .is("responded_at", null)
      } catch {
        // best-effort
      }
    },
    async "session.completed"(_event, ctx) {
      try {
        await getSupabaseClient()
          .from("pending_inputs")
          .update({ responded_at: new Date().toISOString() })
          .eq("session_id", ctx.session.id)
          .is("responded_at", null)
      } catch {
        // best-effort
      }
    },
    async "session.failed"(_event, ctx) {
      try {
        await getSupabaseClient()
          .from("pending_inputs")
          .update({ responded_at: new Date().toISOString() })
          .eq("session_id", ctx.session.id)
          .is("responded_at", null)
      } catch {
        // best-effort
      }
    },
  },
})
