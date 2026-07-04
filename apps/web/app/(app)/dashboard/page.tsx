import type { Metadata } from "next"

import {
  getConversation,
  listConversations,
} from "@/features/chat/actions"
import { ChatHeader } from "@/features/chat/components/chat-header"
import { ChatHome } from "@/features/chat/components/chat-home"
import { ChatView } from "@/features/chat/components/chat-view"

export const metadata: Metadata = {
  title: "Kreatos",
}

export const dynamic = "force-dynamic"

/**
 * Home del dashboard = chat directo con el orquestador. El header global del
 * layout no se renderiza aquí: ChatHeader (h-12) toma su lugar con el
 * trigger del sidebar (mobile), el selector de conversaciones y "nueva".
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
    <main className="flex min-h-dvh w-full flex-col">
      <ChatHeader current={conversation ?? undefined} recent={conversations} />
      <div className="flex flex-1 flex-col">
        {conversation ? (
          <ChatView conversation={conversation} />
        ) : (
          <ChatHome conversations={conversations} />
        )}
      </div>
    </main>
  )
}
