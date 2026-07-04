"use server"

import { revalidatePath } from "next/cache"

import { getEveClient } from "@/lib/eve"
import { getAdminClient } from "@/lib/supabase/admin"

export interface ChatActionState {
  ok?: boolean
  formError?: string
  conversationId?: string
}

export interface ChatConversation {
  id: string
  title: string
  eve_session_id: string | null
  eve_run_ids: string[]
  created_at: string
  updated_at: string
}

/** Conversaciones recientes para el home y el switcher. */
export async function listConversations(
  limit = 20
): Promise<ChatConversation[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("chat_conversations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit)
  return (data as ChatConversation[]) ?? []
}

export async function getConversation(
  id: string
): Promise<ChatConversation | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  return (data as ChatConversation) ?? null
}

/**
 * Título corto autogenerado (gpt-5-nano vía REST — sin SDK en web).
 * Fallback: primeras palabras del mensaje.
 */
async function generateTitle(message: string): Promise<string> {
  const fallback = message.trim().split(/\s+/).slice(0, 7).join(" ").slice(0, 60)
  const key = process.env.OPENAI_API_KEY
  if (!key) return fallback
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        reasoning_effort: "minimal",
        messages: [
          {
            role: "user",
            content: `Genera un título de 3 a 6 palabras en español para una conversación que empieza así (responde SOLO el título, sin comillas ni punto final):\n\n${message.slice(0, 500)}`,
          },
        ],
      }),
    })
    if (!res.ok) return fallback
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const title = data.choices?.[0]?.message?.content?.trim()
    return title && title.length >= 3 ? title.slice(0, 80) : fallback
  } catch {
    return fallback
  }
}

async function persistSession(
  conversationId: string,
  prevRunIds: string[],
  response: { continuationToken?: string; sessionId?: string }
) {
  if (!response.sessionId) return
  const supabase = getAdminClient()
  await supabase
    .from("chat_conversations")
    .update({
      eve_session_id: response.continuationToken ?? null,
      eve_run_ids: [...prevRunIds, response.sessionId],
    })
    .eq("id", conversationId)
}

/** Conversación nueva: crea el row, manda el primer mensaje y titula. */
export async function createConversation(
  message: string
): Promise<ChatActionState> {
  const trimmed = message.trim()
  if (trimmed.length < 3) return { formError: "Escribe un mensaje más largo." }

  const supabase = getAdminClient()
  const { data: row, error } = await supabase
    .from("chat_conversations")
    .insert({ title: trimmed.split(/\s+/).slice(0, 7).join(" ").slice(0, 60) })
    .select("id")
    .single()
  if (error) return { formError: `No se pudo crear: ${error.message}` }

  try {
    const eve = getEveClient()
    const response = await eve.session().send(trimmed)
    await persistSession(row.id, [], response)
  } catch (err) {
    return {
      formError: `No se pudo contactar al agente: ${err instanceof Error ? err.message : "error desconocido"}`,
      conversationId: row.id,
    }
  }

  // Título bonito (no bloquea el flujo si falla).
  const title = await generateTitle(trimmed)
  await supabase
    .from("chat_conversations")
    .update({ title })
    .eq("id", row.id)

  revalidatePath("/dashboard")
  return { ok: true, conversationId: row.id }
}

/** Mensaje a una conversación existente. */
export async function sendChatMessage(
  conversationId: string,
  message: string
): Promise<ChatActionState> {
  const trimmed = message.trim()
  if (trimmed.length < 3) return { formError: "Escribe un mensaje más largo." }
  const conversation = await getConversation(conversationId)
  if (!conversation) return { formError: "La conversación no existe." }

  try {
    const eve = getEveClient()
    const session = conversation.eve_session_id
      ? eve.session(conversation.eve_session_id)
      : eve.session()
    const response = await session.send(trimmed)
    await persistSession(
      conversationId,
      conversation.eve_run_ids ?? [],
      response
    )
  } catch (err) {
    return {
      formError: `No se pudo contactar al agente: ${err instanceof Error ? err.message : "error desconocido"}`,
    }
  }
  revalidatePath("/dashboard")
  return { ok: true }
}

/** Respuesta a una pregunta pendiente (HITL) del orquestador. */
export async function answerChatInput(
  conversationId: string,
  requestId: string,
  text: string,
  questionPrompt?: string
): Promise<ChatActionState> {
  const trimmed = text.trim()
  if (trimmed.length < 1) return { formError: "Escribe una respuesta." }
  const conversation = await getConversation(conversationId)
  if (!conversation?.eve_session_id) {
    return { formError: "No hay sesión activa en esta conversación." }
  }
  try {
    const eve = getEveClient()
    const session = eve.session(conversation.eve_session_id)
    const quoted = questionPrompt?.trim()
      ? `Respondiendo a la pregunta pendiente («${questionPrompt.trim().slice(0, 180)}»): ${trimmed}`
      : trimmed
    const response = await session.send({
      message: quoted,
      inputResponses: [{ requestId, text: trimmed }],
    })
    await persistSession(
      conversationId,
      conversation.eve_run_ids ?? [],
      response
    )
  } catch (err) {
    return {
      formError: `No se pudo responder: ${err instanceof Error ? err.message : "error desconocido"}`,
    }
  }
  revalidatePath("/dashboard")
  return { ok: true }
}
