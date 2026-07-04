import type { Metadata } from "next"

import {
  getConversation,
  listConversations,
} from "@/features/chat/actions"
import { ChatHome } from "@/features/chat/components/chat-home"
import { ChatView } from "@/features/chat/components/chat-view"

export const metadata: Metadata = {
  title: "Kreatos",
}

export const dynamic = "force-dynamic"

/**
 * Home del dashboard = chat directo con el orquestador.
 * Sin `?c=`: conversación nueva (input al centro + historial).
 * Con `?c=<id>`: la conversación activa, timeline estilo monitor.
 */
export default async function DashboardChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { c } = await searchParams
  const conversations = await listConversations()

  const conversation = c ? await getConversation(c) : null

  return (
    <main className="h-[calc(100dvh-48px)] w-full">
      {conversation ? (
        <ChatView conversation={conversation} recent={conversations} />
      ) : (
        <ChatHome conversations={conversations} />
      )}
    </main>
  )
}
