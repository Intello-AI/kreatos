"use server"

import { getAdminClient } from "@/lib/supabase/admin"

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
