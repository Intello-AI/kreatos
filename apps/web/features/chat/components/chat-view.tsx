"use client"

import { useMemo, useState } from "react"

import {
  answerChatInput,
  getConversation,
  sendChatMessage,
  type ChatConversation,
} from "@/features/chat/actions"
import {
  ChatActivity,
  type ChatHandlers,
} from "@/features/chat/components/chat-activity"

/** Conversación activa: timeline del chat (el header lo pone la página). */
export function ChatView({
  conversation,
}: {
  conversation: ChatConversation
}) {
  const [runIds, setRunIds] = useState(conversation.eve_run_ids)

  const handlers = useMemo<ChatHandlers>(
    () => ({
      // Tras cada envío se refetchea la fila: el run nuevo entra a
      // eve_run_ids y el chat conecta su stream en vivo.
      send: async (text) => {
        const result = await sendChatMessage(conversation.id, text)
        if (!result.formError) {
          const fresh = await getConversation(conversation.id)
          setRunIds(fresh?.eve_run_ids ?? [])
        }
        return result
      },
      answer: async (requestId, text, prompt) => {
        const result = await answerChatInput(
          conversation.id,
          requestId,
          text,
          prompt
        )
        if (!result.formError) {
          const fresh = await getConversation(conversation.id)
          setRunIds(fresh?.eve_run_ids ?? [])
        }
        return result
      },
    }),
    [conversation.id]
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      {/* Nombre accesible de la ruta: el título vive en el dropdown del header,
          esta pantalla no tenía h1 para lectores de pantalla. */}
      <h1 className="sr-only">{conversation.title ?? "Conversación"}</h1>
      <ChatActivity
        key={conversation.id}
        runIds={runIds}
        handlers={handlers}
      />
    </div>
  )
}
