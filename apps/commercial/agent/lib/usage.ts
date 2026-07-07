import { defineHook } from "eve/hooks"

import { notifyTaskEmail } from "./email"
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
    qwen: "qwen3.7-plus",
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

// Subagentes TERMINALES: su session.completed = la TAREA del usuario terminó.
// (La raíz es persistente — se parquea entre mensajes — así que su fin NO sirve
// como señal.) Cierran la fila 'task' 'running' del sujeto → dispara sonido+correo.
const TERMINAL_AGENTS: Record<string, { kind: string; title: string }> = {
  "site-builder": { kind: "site_build", title: "Sitio listo" },
  "brand-curator": { kind: "brand_curate", title: "Marca lista" },
  proposal: { kind: "proposal", title: "Propuesta lista" },
}
// Subagentes cuyo fin es un HITO visible (in-app, sin correo).
const MILESTONE_TITLES: Record<string, string> = {
  "art-director": "Spec de diseño listo",
}

/**
 * Notificación durable al terminar un SUBAGENTE (session.completed/failed). La
 * UI abrió una fila 'task' 'running' para el sujeto al arrancar (con user_id =
 * atribución); aquí:
 *  - agente TERMINAL → cierra esa tarea (done/failed). Si no hay fila (arranque
 *    por chat, donde el sujeto lo descubre el agente), inserta una standalone.
 *  - agente de HITO → inserta una fila 'milestone' bajo la tarea del sujeto.
 * Best-effort: nunca lanza (tumbaría el turn).
 */
async function recordCompletion(
  agent: string,
  sessionId: string,
  status: "done" | "failed",
): Promise<void> {
  if (agent === "root") return
  const terminal = TERMINAL_AGENTS[agent]
  const milestoneTitle = MILESTONE_TITLES[agent]
  if (!terminal && !milestoneTitle) return

  const supabase = getSupabaseClient()
  const { data: ctxRow } = await supabase
    .from("session_context")
    .select("lead_id, site_id, user_id")
    .eq("session_id", sessionId)
    .maybeSingle()
  const subjectType = ctxRow?.site_id ? "site" : ctxRow?.lead_id ? "lead" : null
  const subjectId = ctxRow?.site_id ?? ctxRow?.lead_id ?? null
  if (!subjectType || !subjectId) return
  const href =
    subjectType === "site"
      ? `/dashboard/sites/${subjectId}`
      : `/dashboard/leads/${subjectId}`

  const { data: task } = await supabase
    .from("agent_notifications")
    .select("id, user_id, root_session_id, title")
    .eq("level", "task")
    .eq("status", "running")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (terminal) {
    if (task) {
      await supabase
        .from("agent_notifications")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", task.id)
    } else {
      await supabase.from("agent_notifications").insert({
        user_id: ctxRow?.user_id ?? null,
        session_id: sessionId,
        root_session_id: sessionId,
        level: "task",
        status,
        kind: terminal.kind,
        title: terminal.title,
        subject_type: subjectType,
        subject_id: subjectId,
        href,
      })
    }
    // Correo al usuario que la inició (Capa 3, solo tareas raíz). Best-effort.
    void notifyTaskEmail(task?.user_id ?? ctxRow?.user_id ?? null, {
      title: task?.title ?? terminal.title,
      status,
      href,
    })
    return
  }

  // Hito: solo bajo una tarea del sujeto ya abierta.
  if (!task) return
  await supabase.from("agent_notifications").insert({
    user_id: task.user_id,
    session_id: sessionId,
    root_session_id: task.root_session_id,
    level: "milestone",
    status,
    kind: agent,
    title: status === "done" ? milestoneTitle : `El ${agent} falló`,
    subject_type: subjectType,
    subject_id: subjectId,
    href,
  })
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
            stepIndex?: number
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
            // step_index correlaciona esta fila con las tool_calls del mismo
            // step (vista lead_tool_cost reparte el costo del step por tool).
            step_index: data.stepIndex ?? null,
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
            // (turn_id, step_index) = llave para unir con token_usage y
            // repartir el costo del step entre sus tools (lead_tool_cost).
            turn_id: event.data.turnId ?? null,
            step_index: event.data.stepIndex ?? null,
          }))
          await getSupabaseClient().from("tool_calls").insert(rows)
        } catch {
          // best-effort
        }
      },
      // Notificación durable de tarea/hito: el fin de un SUBAGENTE terminal
      // cierra la tarea del usuario (sonido+correo); un intermedio, un hito.
      async "session.completed"(_event, ctx) {
        try {
          await recordCompletion(agent, ctx.session.id, "done")
        } catch {
          // best-effort
        }
      },
      async "session.failed"(_event, ctx) {
        try {
          await recordCompletion(agent, ctx.session.id, "failed")
        } catch {
          // best-effort
        }
      },
    },
  })
}
