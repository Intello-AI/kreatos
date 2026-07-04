"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  PaperPlaneRightIcon,
  WarningIcon,
} from "@phosphor-icons/react"

import { sendSiteMessage } from "@/features/sites/actions"
import { cn } from "@/lib/utils"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Message,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"

interface ActivityItem {
  id: string
  at: string
  depth: 0 | 1
  kind: "action" | "text" | "user" | "status" | "error"
  label: string
  detail?: string
  callId?: string
  done?: boolean
  failed?: boolean
}

interface StreamEvent {
  type: string
  data?: Record<string, unknown>
  meta?: { at?: string }
}

const MAX_ITEMS = 200

/** Labels amigables por tool; detail extrae lo útil del input. */
const TOOL_LABELS: Record<
  string,
  {
    label: string
    detail?: (input: Record<string, unknown>) => string | undefined
  }
> = {
  get_site_brief: { label: "Leyendo brief, lead y referencias de diseño" },
  save_site_version: {
    label: "Guardando versión del spec",
    detail: (i) =>
      i["changelog"] ? String(i["changelog"]).slice(0, 100) : undefined,
  },
  create_site_repo: { label: "Creando repo GitHub del cliente" },
  clone_site_repo: { label: "Clonando repo en el sandbox" },
  push_site_version: { label: "Subiendo código al repo" },
  create_vercel_project: { label: "Creando proyecto en Vercel" },
  await_preview_deployment: { label: "Esperando deployment preview" },
  save_qa_report: { label: "Guardando reporte de QA" },
  publish_site: { label: "Publicando a producción" },
  update_site_status: {
    label: "Actualizando status",
    detail: (i) => (i["status"] ? `→ ${String(i["status"])}` : undefined),
  },
  bash: {
    label: "Terminal",
    detail: (i) =>
      i["command"] ? String(i["command"]).slice(0, 100) : undefined,
  },
  read_file: {
    label: "Leyendo archivo",
    detail: (i) => (i["path"] ? String(i["path"]) : undefined),
  },
  write_file: {
    label: "Escribiendo archivo",
    detail: (i) => (i["path"] ? String(i["path"]) : undefined),
  },
  glob: { label: "Buscando archivos" },
  grep: { label: "Buscando en el código" },
  load_skill: {
    label: "Cargando skill",
    detail: (i) => (i["skill"] ? String(i["skill"]) : undefined),
  },
  todo: {
    label: "Plan de trabajo",
    detail: (i) => {
      const todos = i["todos"] as Array<Record<string, unknown>> | undefined
      if (!todos?.length) return undefined
      const active = todos.find((t) => t["status"] === "in_progress")
      return active
        ? `${String(active["content"])} (${todos.length} pasos)`
        : `${todos.length} pasos`
    },
  },
  web_fetch: {
    label: "Consultando página",
    detail: (i) => (i["url"] ? String(i["url"]) : undefined),
  },
  web_search: {
    label: "Buscando en la web",
    detail: (i) => (i["query"] ? String(i["query"]) : undefined),
  },
}

function describeAction(action: Record<string, unknown>): {
  label: string
  detail?: string
} {
  if (action["kind"] === "subagent-call") {
    return {
      label: `Delegando a ${String(action["subagentName"] ?? action["name"] ?? "subagente")}`,
    }
  }
  const toolName = String(action["toolName"] ?? action["name"] ?? "herramienta")
  const input = (action["input"] ?? {}) as Record<string, unknown>
  const known = TOOL_LABELS[toolName]
  if (known) return { label: known.label, detail: known.detail?.(input) }
  return { label: toolName, detail: JSON.stringify(input).slice(0, 80) }
}

function formatTime(at: string): string {
  if (!at) return ""
  try {
    return new Date(at).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

export function SiteActivity({
  runId,
  siteId,
}: {
  runId: string
  siteId: string
}) {
  const router = useRouter()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [connected, setConnected] = useState(false)
  const [message, setMessage] = useState("")
  const [sendError, setSendError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const seenChildren = useRef<Set<string>>(new Set())

  useEffect(() => {
    const controller = new AbortController()
    let counter = 0
    seenChildren.current = new Set()

    const push = (item: Omit<ActivityItem, "id">) => {
      counter += 1
      const withId = { ...item, id: `${item.depth}-${counter}` }
      setItems((prev) => [...prev.slice(-MAX_ITEMS + 1), withId])
    }

    const resolveCall = (callId: string, failed: boolean) => {
      setItems((prev) =>
        prev.map((item) =>
          item.callId === callId ? { ...item, done: true, failed } : item
        )
      )
    }

    /** Cierra spinners huérfanos cuando el turno/sesión termina sin action.result. */
    const resolvePending = (depth: 0 | 1, failed: boolean) => {
      setItems((prev) =>
        prev.map((item) =>
          item.kind === "action" && item.depth === depth && !item.done
            ? { ...item, done: true, failed }
            : item
        )
      )
    }

    const handleEvent = (event: StreamEvent, depth: 0 | 1) => {
      const d = event.data ?? {}
      const at = event.meta?.at ?? ""
      switch (event.type) {
        case "actions.requested": {
          const actions = (d["actions"] ?? []) as Array<Record<string, unknown>>
          for (const action of actions) {
            const { label, detail } = describeAction(action)
            push({
              at,
              depth,
              kind: "action",
              label,
              detail,
              callId: action["callId"] ? String(action["callId"]) : undefined,
              done: false,
            })
          }
          break
        }
        case "action.result": {
          // El payload real anida el resultado: data.result.{callId, kind, output}.
          const result = (d["result"] ?? d) as Record<string, unknown>
          const callId = result["callId"] ?? d["callId"]
          if (callId) {
            const failed =
              d["status"] === "failed" || result["kind"] === "tool-error"
            resolveCall(String(callId), failed)
          }
          break
        }
        case "subagent.called": {
          const childId = d["childSessionId"] as string | undefined
          if (childId && depth === 0 && !seenChildren.current.has(childId)) {
            seenChildren.current.add(childId)
            void consume(childId, 1)
          }
          break
        }
        case "subagent.completed": {
          const result = (d["result"] ?? d) as Record<string, unknown>
          const callId = result["callId"] ?? d["callId"]
          if (callId) resolveCall(String(callId), false)
          break
        }
        case "message.received":
          // Solo del root: el message.received del hijo es el prompt interno
          // de delegación y duplicaría ruido.
          if (depth === 0 && d["message"]) {
            push({ at, depth, kind: "user", label: String(d["message"]) })
          }
          break
        case "message.completed":
          if (d["message"]) {
            push({ at, depth, kind: "text", label: String(d["message"]) })
          }
          break
        case "turn.completed":
        case "session.waiting":
          resolvePending(depth, false)
          if (event.type === "session.waiting") {
            push({
              at,
              depth,
              kind: "status",
              label: "Agente en espera — puedes escribirle abajo",
            })
          }
          break
        case "step.failed":
        case "turn.failed":
        case "session.failed":
          resolvePending(depth, true)
          push({
            at,
            depth,
            kind: "error",
            label: String(
              d["message"] ?? d["code"] ?? "Error en la sesión"
            ).slice(0, 300),
          })
          break
      }
    }

    const consume = async (sessionId: string, depth: 0 | 1) => {
      try {
        const res = await fetch(`/eve/v1/session/${sessionId}/stream`, {
          signal: controller.signal,
        })
        if (!res.ok || !res.body) return
        if (depth === 0) setConnected(true)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              handleEvent(JSON.parse(line) as StreamEvent, depth)
            } catch {
              // línea parcial: ignorar
            }
          }
        }
      } catch {
        // abort o red
      } finally {
        if (depth === 0) setConnected(false)
      }
    }

    void consume(runId, 0)
    return () => controller.abort()
  }, [runId])

  const onSend = () => {
    setSendError(undefined)
    startTransition(async () => {
      const result = await sendSiteMessage(siteId, message)
      if (result?.formError) {
        setSendError(result.formError)
      } else {
        setMessage("")
        router.refresh()
      }
    })
  }

  // Acciones consecutivas del mismo nivel se agrupan en un MessageGroup;
  // mensajes/errores/status van como bloques individuales.
  type Block =
    | { key: string; type: "actions"; items: ActivityItem[] }
    | { key: string; type: "single"; item: ActivityItem }
  const blocks = items.reduce<Block[]>((acc, item) => {
    if (item.kind === "action") {
      const last = acc[acc.length - 1]
      if (last?.type === "actions" && last.items[0]?.depth === item.depth) {
        last.items.push(item)
        return acc
      }
      acc.push({ key: item.id, type: "actions", items: [item] })
    } else {
      acc.push({ key: item.id, type: "single", item })
    }
    return acc
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 p-3">
        <div>
          <h2 className="text-sm font-medium">Monitor de actividad</h2>
          <p className="text-xs text-muted-foreground">
            Revisa que está haciendo el agente, puedes enviarle mensajes debajo.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1">
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5",
              connected ? "border-none bg-success/30" : "bg-muted-foreground/40"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                connected
                  ? "animate-pulse bg-success"
                  : "bg-muted-foreground/40"
              )}
            />
            {connected ? "En vivo" : "Desconectado"}
          </Badge>
        </div>
      </div>

      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1 border-t">
          <MessageScrollerViewport className="p-3">
            <MessageScrollerContent className="gap-4">
              {blocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Conectando al stream…
                </p>
              ) : (
                blocks.map((block) =>
                  block.type === "actions" ? (
                    <MessageScrollerItem key={block.key}>
                      <MessageGroup
                        className={cn(
                          "gap-1.5 border-l-2 border-border/60 py-0.5 pl-3",
                          block.items[0]?.depth === 1 && "ml-5",
                        )}
                      >
                        {block.items.map((item) => (
                          <ActionRow key={item.id} item={item} />
                        ))}
                      </MessageGroup>
                    </MessageScrollerItem>
                  ) : (
                    <BlockItem key={block.key} item={block.item} />
                  ),
                )
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="flex w-full flex-col border-t">
        <InputGroup className="shrink-0">
          <InputGroupTextarea
            placeholder="Escríbele al agente (contexto, cambios, preguntas)…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (!pending && message.trim().length >= 3) onSend()
              }
            }}
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              size="icon-sm"
              variant={"default"}
              className="ml-auto"
              onClick={onSend}
              disabled={pending || message.trim().length < 3}
              aria-label="Enviar mensaje al agente"
            >
              {pending ? <Spinner /> : <PaperPlaneRightIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {sendError && <p className="text-sm text-destructive">{sendError}</p>}
      </div>
    </div>
  )
}

/** Fila compacta de una tool call (dentro de un MessageGroup de acciones). */
function ActionRow({ item }: { item: ActivityItem }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 shrink-0">
        {item.failed ? (
          <WarningIcon className="size-3.5 text-destructive" />
        ) : item.done ? (
          <CheckIcon className="size-3.5 text-success" />
        ) : (
          <Spinner className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{item.label}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
            {formatTime(item.at)}
          </span>
        </div>
        {item.detail && (
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {item.detail}
          </p>
        )}
      </div>
    </div>
  )
}

/** Bloques individuales: mensajes tuyos/del agente, errores y status. */
function BlockItem({ item }: { item: ActivityItem }) {
  return (
    <MessageScrollerItem>
      {item.kind === "user" ? (
        <Message align="end">
          <MessageContent>
            <MessageHeader className="justify-end">
              Tú · {formatTime(item.at)}
            </MessageHeader>
            <Bubble variant="default" align="end">
              <BubbleContent>{item.label}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : item.kind === "text" ? (
        <Message>
          <MessageContent>
            <MessageHeader className="gap-1.5">
              <Image
                src="/avatar-agent.svg"
                alt="Agent avatar"
                width={16}
                height={16}
                className="size-4 shrink-0"
              />
              Kreatos AI
            </MessageHeader>
            <Bubble variant="muted">
              <BubbleContent>{item.label}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : item.kind === "error" ? (
        <Message>
          <MessageContent>
            <Bubble variant="destructive">
              <BubbleContent>{item.label}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <p className="px-1 text-center text-xs text-muted-foreground italic">
          {item.label}
        </p>
      )}
    </MessageScrollerItem>
  )
}
