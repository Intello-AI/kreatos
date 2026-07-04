"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CaretDownIcon, PlusIcon } from "@phosphor-icons/react"

import {
  answerChatInput,
  getConversation,
  sendChatMessage,
  type ChatConversation,
} from "@/features/chat/actions"
import {
  SiteActivity,
  type ActivityHandlers,
} from "@/features/sites/components/site-activity"
import { formatRelative } from "@/lib/dates"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Conversación activa: switcher arriba + timeline del monitor (chat). */
export function ChatView({
  conversation,
  recent,
}: {
  conversation: ChatConversation
  recent: ChatConversation[]
}) {
  const router = useRouter()
  const [runIds, setRunIds] = useState(conversation.eve_run_ids)

  const handlers = useMemo<ActivityHandlers>(
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-sidebar px-3 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 max-w-[70%] justify-start gap-1.5 px-2 font-medium"
            >
              <span className="truncate">{conversation.title}</span>
              <CaretDownIcon className="size-3 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {recent.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => router.push(`/dashboard?c=${item.id}`)}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelative(item.updated_at)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button asChild variant="ghost" size="icon-sm" aria-label="Nueva conversación">
          <Link href="/dashboard">
            <PlusIcon />
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <SiteActivity
          key={conversation.id}
          siteId={conversation.id}
          runIds={runIds}
          handlers={handlers}
          hideHeader
        />
      </div>
    </div>
  )
}
