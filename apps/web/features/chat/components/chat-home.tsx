"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChatCircleDotsIcon, PaperPlaneRightIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import {
  createConversation,
  type ChatConversation,
} from "@/features/chat/actions"
import { formatRelative } from "@/lib/dates"
import { Icon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

/**
 * Home del chat (conversación nueva): input protagonista al centro — estilo
 * Claude/ChatGPT — y el historial de conversaciones debajo.
 */
export function ChatHome({
  conversations,
}: {
  conversations: ChatConversation[]
}) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()

  const onSend = () => {
    const text = message.trim()
    if (text.length === 0) return
    startTransition(async () => {
      const result = await createConversation(text)
      if (result.formError) {
        toast.error(result.formError)
        if (!result.conversationId) return
      }
      if (result.conversationId) {
        router.push(`/dashboard?c=${result.conversationId}`)
      }
    })
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-48px)] w-full max-w-2xl flex-col justify-center gap-8 p-4">
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Icon name="Logo" className="h-8 w-auto" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold md:text-2xl">
              ¿En qué trabajamos hoy?
            </h1>
            <p className="text-sm text-muted-foreground">
              Leads, propuestas, sitios, referencias — pídele lo que sea al
              orquestador.
            </p>
          </div>
        </div>

        <InputGroup className="shadow-sm">
          <InputGroupTextarea
            autoFocus
            placeholder="Busca leads de constructoras, génerale el sitio a X, ¿cómo va el pipeline?…"
            aria-label="Mensaje para el orquestador"
            value={message}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                if (!pending) onSend()
              }
            }}
          />
          <InputGroupAddon align="block-end" className="justify-end">
            <InputGroupButton
              size="icon-sm"
              aria-label="Enviar"
              disabled={pending || message.trim().length === 0}
              onClick={onSend}
            >
              {pending ? <Spinner className="size-3.5" /> : <PaperPlaneRightIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {conversations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Conversaciones recientes
          </p>
          <ul className="divide-y border">
            {conversations.slice(0, 8).map((conversation) => (
              <li key={conversation.id}>
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto w-full justify-between gap-3 rounded-none px-3 py-2.5 font-normal"
                >
                  <Link href={`/dashboard?c=${conversation.id}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <ChatCircleDotsIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">
                        {conversation.title}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(conversation.updated_at)}
                    </span>
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
