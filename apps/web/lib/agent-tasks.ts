import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type TaskKind =
  | "site_build"
  | "brand_curate"
  | "proposal"
  | "outreach"
  | "references"
  | "chat"

type StartInput = {
  /** Sesión de eve devuelta por `.send()` (raíz de la tarea). */
  sessionId: string | null
  kind: TaskKind
  /** Título estable, sustantivo del sujeto ("Sitio de {name}"). El estado
   *  (running/done/failed) lo pinta la UI; no metas el verbo en el título. */
  title: string
  subjectType?: "lead" | "site"
  subjectId?: string | null
  href?: string | null
}

/**
 * Registra el ARRANQUE de una tarea del agente: QUIÉN la inició (atribución) +
 * la fila `agent_notifications` 'task'/'running' que el hook del subagente
 * TERMINAL cerrará (done/failed → campana, sonido, correo). También propaga la
 * atribución a `session_context.user_id`. Best-effort: JAMÁS tumba el arranque
 * de la tarea por la notificación.
 */
export async function startAgentTask(input: StartInput): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const admin = getAdminClient()

    await admin.from("agent_notifications").insert({
      user_id: user?.id ?? null,
      session_id: input.sessionId,
      root_session_id: input.sessionId,
      level: "task",
      status: "running",
      kind: input.kind,
      title: input.title,
      subject_type: input.subjectType ?? null,
      subject_id: input.subjectId ?? null,
      href: input.href ?? null,
    })

    if (input.sessionId) {
      await admin.from("session_context").upsert(
        {
          session_id: input.sessionId,
          user_id: user?.id ?? null,
          ...(input.subjectType === "lead" && input.subjectId
            ? { lead_id: input.subjectId }
            : {}),
          ...(input.subjectType === "site" && input.subjectId
            ? { site_id: input.subjectId }
            : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id" },
      )
    }
  } catch {
    // best-effort
  }
}
