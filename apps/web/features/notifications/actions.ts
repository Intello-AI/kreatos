"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export interface PendingQuestion {
  requestId: string
  prompt: string
  createdAt: string
  /** Link al lugar donde se responde (conversación del chat o site). */
  href: string
  /** Etiqueta del origen para la lista ("Chat: título" / "Sitio: slug"). */
  sourceLabel: string
}

/**
 * Preguntas HITL abiertas (las escribe el hook pending-inputs del agente),
 * resueltas a su destino: la conversación del chat o el site cuya sesión
 * las emitió.
 */
export async function listPendingQuestions(): Promise<PendingQuestion[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("pending_inputs")
    .select("request_id, session_id, prompt, created_at")
    .is("responded_at", null)
    .order("created_at", { ascending: false })
    .limit(12)
  if (!data?.length) return []

  const results: PendingQuestion[] = []
  for (const row of data) {
    let href = "/dashboard"
    let sourceLabel = "Chat"
    const [{ data: site }, { data: conversation }] = await Promise.all([
      supabase
        .from("sites")
        .select("id, slug")
        .contains("eve_run_ids", [row.session_id])
        .maybeSingle(),
      supabase
        .from("chat_conversations")
        .select("id, title")
        .contains("eve_run_ids", [row.session_id])
        .maybeSingle(),
    ])
    if (site) {
      href = `/dashboard/sites/${site.id}`
      sourceLabel = `Sitio: ${site.slug}`
    } else if (conversation) {
      href = `/dashboard?c=${conversation.id}`
      sourceLabel = `Chat: ${conversation.title ?? "conversación"}`
    }
    results.push({
      requestId: row.request_id,
      prompt: row.prompt,
      createdAt: row.created_at,
      href,
      sourceLabel,
    })
  }
  return results
}

export interface AgentNotification {
  id: string
  level: "task" | "milestone"
  status: "running" | "done" | "failed" | "needs_input"
  kind: string
  title: string
  href: string | null
  createdAt: string
  readAt: string | null
}

/** Usuario actual (o null en local sin auth). */
async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Feed de notificaciones de tarea/hito (Capa 0): las del usuario + las sin
 * dueño (chat/schedule). Más nuevas primero.
 */
export async function listNotifications(): Promise<AgentNotification[]> {
  const supabase = getAdminClient()
  const userId = await currentUserId()
  let query = supabase
    .from("agent_notifications")
    .select("id, level, status, kind, title, href, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(30)
  if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`)
  const { data } = await query
  return (data ?? []).map((row) => ({
    id: row.id,
    level: row.level as AgentNotification["level"],
    status: row.status as AgentNotification["status"],
    kind: row.kind,
    title: row.title,
    href: row.href,
    createdAt: row.created_at,
    readAt: row.read_at,
  }))
}

/** Marca notificaciones como leídas (todas las no leídas del usuario, o un set). */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const supabase = getAdminClient()
  const userId = await currentUserId()
  let query = supabase
    .from("agent_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
  if (ids?.length) query = query.in("id", ids)
  if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`)
  await query
}
