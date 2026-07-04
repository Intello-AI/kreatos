"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  PaperPlaneRightIcon,
  WarningIcon,
  XIcon,
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
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
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
import { Button } from "@/components/ui/button"
import { Streamdown } from "streamdown"

interface ActivityItem {
  id: string
  /** Orden cronológico global: runIndex * 1e6 + secuencia de llegada en el run. */
  sortKey: number
  at: string
  depth: 0 | 1
  kind: "action" | "text" | "user" | "status" | "error" | "question"
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

// Suficiente para reproducir cadenas largas de runs sin recortar en vivo
// (recortar durante el replay hacía "bailar" los items).
const MAX_ITEMS = 600

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
  runIds,
  siteId,
  onClose,
}: {
  /** Cadena completa de runs de la sesión, en orden; el último es el vivo. */
  runIds: string[]
  siteId: string
  /** Si viene, muestra botón de colapsar en el header (modo aside desktop). */
  onClose?: () => void
}) {
  const router = useRouter()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [connected, setConnected] = useState(false)
  const [message, setMessage] = useState("")
  const [sendError, setSendError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const seenChildren = useRef<Set<string>>(new Set())
  // Consumo incremental: cada run de la cadena se consume UNA vez; los sends
  // nuevos solo agregan el run nuevo, sin resetear el timeline.
  const consumedRuns = useRef<Set<string>>(new Set())
  const liveAbort = useRef<AbortController | null>(null)
  const lifetimeAbort = useRef<AbortController | null>(null)
  const counterRef = useRef(0)
  const runIdsKey = runIds.join(",")

  const [historyLoaded, setHistoryLoaded] = useState(false)

  useEffect(() => {
    lifetimeAbort.current = new AbortController()
    return () => lifetimeAbort.current?.abort()
  }, [])

  // ——— Núcleo de consumo (funciones puras sobre refs/estado; estables entre
  // renders porque solo tocan refs y setState). ———

  // Inserción ordenada por sortKey: el historial cargado después cae en su
  // lugar cronológico, arriba de lo vivo, sin mover lo demás.
  const push = (item: Omit<ActivityItem, "id">) => {
    counterRef.current += 1
    const withId = { ...item, id: `item-${counterRef.current}` }
    setItems((prev) =>
      [...prev, withId].sort((a, b) => a.sortKey - b.sortKey).slice(-MAX_ITEMS),
    )
  }

  const resolveCall = (callId: string, failed: boolean) => {
    setItems((prev) =>
      prev.map((item) =>
        item.callId === callId ? { ...item, done: true, failed } : item,
      ),
    )
  }

  /** Cierra spinners huérfanos cuando el turno/sesión termina sin action.result. */
  const resolvePending = (depth: 0 | 1, failed: boolean) => {
    setItems((prev) =>
      prev.map((item) =>
        item.kind === "action" && item.depth === depth && !item.done
          ? { ...item, done: true, failed }
          : item,
      ),
    )
  }

  const handleEvent = (
    event: StreamEvent,
    depth: 0 | 1,
    live: boolean,
    nextKey: () => number,
  ) => {
    const d = event.data ?? {}
    const at = event.meta?.at ?? ""
    // push con orden cronológico del run al que pertenece el evento.
    const add = (item: Omit<ActivityItem, "id" | "sortKey">) =>
      push({ ...item, sortKey: nextKey() })
    switch (event.type) {
      case "actions.requested": {
        const actions = (d["actions"] ?? []) as Array<Record<string, unknown>>
        for (const action of actions) {
          const { label, detail } = describeAction(action)
          add({
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
            // El hijo comparte el contador del run del padre: sus eventos se
            // intercalan cronológicamente con los del root.
            void consume(childId, 1, live, nextKey)
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
            add({ at, depth, kind: "user", label: String(d["message"]) })
          }
          break
        case "message.completed":
          if (d["message"]) {
            add({ at, depth, kind: "text", label: String(d["message"]) })
          }
          break
        case "input.requested": {
          // El agente pide input humano (HITL): mostrar la pregunta para que
          // se le pueda contestar desde el composer.
          const requests = (d["requests"] ?? []) as Array<Record<string, unknown>>
          for (const request of requests) {
            const action = (request["action"] ?? {}) as Record<string, unknown>
            const input = (action["input"] ?? {}) as Record<string, unknown>
            const prompt = input["prompt"] ?? request["prompt"]
            if (prompt) {
              add({ at, depth, kind: "question", label: String(prompt) })
            }
          }
          break
        }
        case "turn.completed":
        case "session.waiting":
          resolvePending(depth, false)
          if (event.type === "session.waiting") {
            add({
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
          add({
            at,
            depth,
            kind: "error",
            label: String(
              d["message"] ?? d["code"] ?? "Error en la sesión",
            ).slice(0, 300),
          })
          break
      }
  }

  /**
   * Consume el stream de un run. `live: false` = histórico: se reproduce y se
   * corta tras 2.5s sin datos; `live: true` = run actual, conexión abierta.
   * `nextKey` genera el sortKey cronológico del run (compartido con sus hijos).
   */
  const consume = async (
    sessionId: string,
    depth: 0 | 1,
    live: boolean,
    nextKey: () => number,
  ) => {
    const controller = lifetimeAbort.current
    if (!controller) return
    const local = new AbortController()
    if (live && depth === 0) {
      // Un run vivo nuevo sustituye al anterior: se corta la conexión vieja.
      liveAbort.current?.abort()
      liveAbort.current = local
    }
    const onOuterAbort = () => local.abort()
    controller.signal.addEventListener("abort", onOuterAbort)
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const resetIdle = () => {
      if (live) return
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => local.abort(), 2500)
    }
    try {
      const res = await fetch(`/eve/v1/session/${sessionId}/stream`, {
        signal: local.signal,
      })
      if (!res.ok || !res.body) return
      if (depth === 0 && live) setConnected(true)
      resetIdle()

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        resetIdle()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            handleEvent(JSON.parse(line) as StreamEvent, depth, live, nextKey)
          } catch {
            // línea parcial: ignorar
          }
        }
      }
    } catch {
      // abort (idle o unmount) o red
    } finally {
      clearTimeout(idleTimer)
      controller.signal.removeEventListener("abort", onOuterAbort)
      // Solo el live vigente apaga el indicador (un run sustituido no).
      if (depth === 0 && live && liveAbort.current === local) {
        setConnected(false)
      }
    }
  }

  /** sortKey por run: runIndex * 1e6 + secuencia de llegada. */
  const makeKeyFactory = (runIdx: number) => {
    let seq = 0
    return () => runIdx * 1_000_000 + ++seq
  }

  const startRun = (id: string, live: boolean) => {
    consumedRuns.current.add(id)
    void consume(id, 0, live, makeKeyFactory(runIds.indexOf(id)))
  }

  // Al montar: SOLO el run vivo (lo actual, al instante). Cuando la cadena
  // crece (un mensaje tuyo), solo el run nuevo. El historial viejo se carga
  // al scrollear hasta arriba (sentinel), insertándose en su lugar.
  useEffect(() => {
    const lastRunId = runIds[runIds.length - 1]
    if (!lastRunId || consumedRuns.current.has(lastRunId)) return
    startRun(lastRunId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIdsKey])

  const [historyLoading, setHistoryLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadHistory = () => {
    if (historyLoaded || historyLoading) return
    setHistoryLoading(true)
    const older = runIds
      .slice(0, -1)
      .filter((id) => !consumedRuns.current.has(id))
    for (const id of older) startRun(id, false)
    // Los históricos cierran solos (idle 2.5s); tras eso, listo.
    setTimeout(() => {
      setHistoryLoaded(true)
      setHistoryLoading(false)
    }, 3500)
  }

  // Scroll-to-top = cargar historial: sentinel arriba del timeline.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || historyLoaded) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadHistory()
    })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded, runIdsKey])

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
      // El foco regresa al composer para seguir la conversación con teclado.
      composerRef.current?.focus()
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
      <div className="flex shrink-0 items-start justify-between gap-2 p-3">
        <div>
          <h2 className="text-sm font-medium">Monitor de actividad</h2>
          <p className="text-xs text-muted-foreground">
            Revisa que está haciendo el agente, puedes enviarle mensajes debajo.
          </p>
        </div>
        <div className="flex items-center gap-1">
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
            {connected ? "En vivo" : "Dormido"}
          </Badge>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              aria-label="Cerrar monitor de actividad"
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>

      <MessageScrollerProvider defaultScrollPosition="end" autoScroll>
        <MessageScroller className="min-h-0 flex-1 border-t">
          <MessageScrollerViewport className="p-3" preserveScrollOnPrepend>
            <MessageScrollerContent className="gap-4">
              {runIds.length > 1 && !historyLoaded && (
                <MessageScrollerItem scrollAnchor={false}>
                  <div ref={sentinelRef}>
                    <Marker variant="separator">
                      <MarkerContent>
                        {historyLoading ? (
                          <span className="flex items-center gap-1.5">
                            <Spinner className="size-3" /> Cargando historial…
                          </span>
                        ) : (
                          "Historial anterior"
                        )}
                      </MarkerContent>
                    </Marker>
                  </div>
                </MessageScrollerItem>
              )}
              {blocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Conectando al stream…
                </p>
              ) : (
                blocks.map((block) =>
                  block.type === "actions" ? (
                    <MessageScrollerItem key={block.key} messageId={block.key}>
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
            ref={composerRef}
            placeholder="Escríbele al agente (contexto, cambios, preguntas)…"
            aria-label="Mensaje para el agente"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            disabled={pending}
            autoFocus
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              if (e.metaKey || e.ctrlKey) {
                // Cmd/Ctrl+Enter: salto de línea manual (el textarea no lo
                // inserta nativo con modificador).
                e.preventDefault()
                const el = e.currentTarget
                const { selectionStart, selectionEnd, value } = el
                setMessage(
                  value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd),
                )
                requestAnimationFrame(() => {
                  el.selectionStart = el.selectionEnd = selectionStart + 1
                })
              } else if (!e.shiftKey) {
                // Enter: enviar. Shift+Enter conserva el salto nativo.
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
    <Marker className="items-start">
      <MarkerIcon className="mt-0.5">
        {item.failed ? (
          <WarningIcon className="text-destructive" />
        ) : item.done ? (
          <CheckIcon className="text-success" />
        ) : (
          <Spinner />
        )}
      </MarkerIcon>
      <MarkerContent className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-foreground">
            {item.label}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
            {formatTime(item.at)}
          </span>
        </span>
        {item.detail && (
          <span className="block truncate font-mono text-[11px]">
            {item.detail}
          </span>
        )}
      </MarkerContent>
    </Marker>
  )
}

/** Bloques individuales: mensajes tuyos/del agente, errores y status. */
function BlockItem({ item }: { item: ActivityItem }) {
  return (
    <MessageScrollerItem messageId={item.id}>
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
              <BubbleContent>
                {/* Streamdown trae tipografía propia (headings grandes); estos
                    overrides la escalan al text-xs del bubble. */}
                <Streamdown className="text-xs leading-relaxed [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_h4]:text-xs [&_h1]:my-1.5 [&_h2]:my-1.5 [&_h3]:my-1 [&_h4]:my-1 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:my-1.5 [&_pre]:text-[11px] [&_table]:text-xs [&_blockquote]:my-1.5 [&_:not(pre)>code]:mx-0 [&_:not(pre)>code]:rounded-none [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-background [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:text-[11px] [&_:not(pre)>code]:whitespace-nowrap">
                  {item.label}
                </Streamdown>
              </BubbleContent>
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
      ) : item.kind === "question" ? (
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
              Kreatos AI — pregunta y espera tu respuesta
            </MessageHeader>
            <Bubble variant="outline">
              <BubbleContent>
                <Streamdown className="text-xs leading-relaxed [&_p]:my-1 [&_li]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_:not(pre)>code]:mx-0 [&_:not(pre)>code]:rounded-none [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-background [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:text-[11px] [&_:not(pre)>code]:whitespace-nowrap">
                  {item.label}
                </Streamdown>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <Marker variant="separator">
          <MarkerContent>{item.label}</MarkerContent>
        </Marker>
      )}
    </MessageScrollerItem>
  )
}
