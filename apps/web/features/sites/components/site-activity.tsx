"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  FileTextIcon,
  GlobeIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PaperclipIcon,
  PaperPlaneRightIcon,
  QuestionIcon,
  RobotIcon,
  SparkleIcon,
  TerminalWindowIcon,
  WarningIcon,
  WrenchIcon,
  XIcon,
} from "@phosphor-icons/react"

import { toast } from "sonner"

import { answerSiteInput, sendSiteMessage } from "@/features/sites/actions"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { formatTime as formatTimeInUserTz } from "@/lib/dates"
import { cn } from "@/lib/utils"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Bubble, BubbleContent, BubbleQuote } from "@/components/ui/bubble"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Marker, MarkerContent } from "@/components/ui/marker"
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
  kind: "action" | "text" | "report" | "user" | "status" | "error" | "question"
  label: string
  detail?: string
  callId?: string
  done?: boolean
  failed?: boolean
  /** Nombre crudo de la tool (para icono y agrupación). */
  toolName?: string
  /** Input completo de la tool (JSON legible) para el detalle expandible. */
  inputJson?: string
  /** Output de la tool (action.result) para el detalle expandible. */
  outputJson?: string
  /** Presente cuando la acción es una delegación a subagente. */
  subagentName?: string
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
  toolName?: string
  subagentName?: string
} {
  if (action["kind"] === "subagent-call") {
    const name = String(action["subagentName"] ?? action["name"] ?? "subagente")
    return { label: `Delegando a ${name}`, subagentName: name }
  }
  const toolName = String(action["toolName"] ?? action["name"] ?? "herramienta")
  const input = (action["input"] ?? {}) as Record<string, unknown>
  const known = TOOL_LABELS[toolName]
  if (known)
    return { label: known.label, detail: known.detail?.(input), toolName }
  return {
    label: toolName,
    detail: JSON.stringify(input).slice(0, 80),
    toolName,
  }
}

/** Icono por tool, estilo Claude Code. */
function ToolIcon({
  toolName,
  className,
}: {
  toolName?: string
  className?: string
}) {
  const Icon =
    toolName === "load_skill"
      ? SparkleIcon
      : toolName === "bash"
        ? TerminalWindowIcon
        : toolName === "read_file" || toolName === "write_file"
          ? FileTextIcon
          : toolName === "glob" || toolName === "grep"
            ? MagnifyingGlassIcon
            : toolName === "web_fetch" || toolName === "web_search"
              ? GlobeIcon
              : toolName === "todo"
                ? ListChecksIcon
                : WrenchIcon
  return <Icon className={className} />
}

/**
 * Detecta el formato de respuesta-a-pregunta que genera answerSiteInput
 * («pregunta»: respuesta) para renderizarlo como cita estilo WhatsApp.
 */
function parseUserReply(label: string): {
  quote?: string
  text: string
  images: string[]
} {
  // El tag [Contexto: ...] es transporte para el agente; no se muestra.
  const clean = label.replace(/^\[Contexto:[^\]]*\]\s*/, "")

  // Las URLs de adjuntos viajan en el texto (el agente las necesita), pero
  // se renderizan como thumbnails, no como links crudos.
  const imgRe = /^https?:\/\/\S+\.(?:png|jpe?g|webp|gif|svg)(?:\?\S*)?$/i
  const headerRe = /^Te adjunté \d+ archivo\(s\):$/
  const lines = clean.split("\n")
  const images = lines.filter((l) => imgRe.test(l.trim())).map((l) => l.trim())
  const text = lines
    .filter((l) => !imgRe.test(l.trim()) && !headerRe.test(l.trim()))
    .join("\n")
    .trim()

  const match = text.match(
    /^Respondiendo a la pregunta pendiente \(«([\s\S]+?)»\):\s*([\s\S]*)$/
  )
  if (!match) return { text, images }
  return { quote: match[1], text: match[2], images }
}

function formatTime(at: string): string {
  if (!at) return ""
  return formatTimeInUserTz(at)
}

export interface ActivityHandlers {
  send: (text: string) => Promise<{ formError?: string } | void>
  answer: (
    requestId: string,
    text: string,
    prompt?: string
  ) => Promise<{ formError?: string } | void>
  /** Sube archivos y devuelve URLs públicas (activa el clip del composer). */
  upload?: (files: File[]) => Promise<{ formError?: string; urls?: string[] }>
}

export function SiteActivity({
  runIds,
  siteId,
  onClose,
  handlers,
  hideHeader = false,
}: {
  /** Cadena completa de runs de la sesión, en orden; el último es el vivo. */
  runIds: string[]
  siteId: string
  /** Si viene, muestra botón de colapsar en el header (modo aside desktop). */
  onClose?: () => void
  /**
   * Overrides de envío/respuesta (default: acciones del sitio). Permite
   * montar el mismo chat sobre otra sesión eve (p. ej. marca de un lead).
   */
  handlers?: ActivityHandlers
  /** Oculta el header propio (cuando el host ya pone título, p. ej. sheet). */
  hideHeader?: boolean
}) {
  const router = useRouter()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [connected, setConnected] = useState(false)
  const [message, setMessage] = useState("")
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
  // Pregunta HITL pendiente del run vivo: el composer responde al request
  // (con contexto) en vez de mandar un mensaje suelto al root.
  const [pendingInput, setPendingInput] = useState<{
    requestId: string
    prompt: string
  } | null>(null)

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
      [...prev, withId].sort((a, b) => a.sortKey - b.sortKey).slice(-MAX_ITEMS)
    )
  }

  const resolveCall = (
    callId: string,
    failed: boolean,
    outputJson?: string
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.callId === callId
          ? {
              ...item,
              done: true,
              failed,
              outputJson: outputJson ?? item.outputJson,
            }
          : item
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

  const handleEvent = (
    event: StreamEvent,
    depth: 0 | 1,
    live: boolean,
    runIdx: number
  ) => {
    const d = event.data ?? {}
    const at = event.meta?.at ?? ""
    // Orden cronológico REAL: (run, timestamp del evento). Ordenar por llegada
    // desordenaba root vs subagente (streams paralelos, replay a ritmos
    // distintos). Empates conservan orden de llegada (sort estable).
    const add = (item: Omit<ActivityItem, "id" | "sortKey">) =>
      push({ ...item, sortKey: runIdx * 1e13 + (Date.parse(at) || 0) })
    switch (event.type) {
      case "actions.requested": {
        const actions = (d["actions"] ?? []) as Array<Record<string, unknown>>
        for (const action of actions) {
          const { label, detail, toolName, subagentName } =
            describeAction(action)
          let inputJson: string | undefined
          try {
            const raw = JSON.stringify(action["input"] ?? {}, null, 2)
            inputJson = raw === "{}" ? undefined : raw.slice(0, 2000)
          } catch {
            inputJson = undefined
          }
          add({
            at,
            depth,
            kind: "action",
            label,
            detail,
            toolName,
            subagentName,
            inputJson,
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
          let outputJson: string | undefined
          const output = result["output"] ?? result["error"]
          if (output !== undefined && output !== null) {
            try {
              const raw =
                typeof output === "string"
                  ? output
                  : JSON.stringify(output, null, 2)
              outputJson = raw === "{}" ? undefined : raw.slice(0, 2000)
            } catch {
              outputJson = undefined
            }
          }
          resolveCall(String(callId), failed, outputJson)
        }
        break
      }
      case "subagent.called": {
        const childId = d["childSessionId"] as string | undefined
        if (childId && depth === 0 && !seenChildren.current.has(childId)) {
          seenChildren.current.add(childId)
          // Mismo runIdx: los eventos del hijo se intercalan por timestamp.
          void consume(childId, 1, live, runIdx)
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
          // Solo el root te habla a ti (burbuja de chat). El mensaje final
          // del subagente es su reporte interno al orquestador: se muestra
          // como actividad discreta, no como chat.
          add({
            at,
            depth,
            kind: depth === 0 ? "text" : "report",
            label: String(d["message"]),
          })
        }
        break
      case "input.requested": {
        // El agente pide input humano (HITL). Solo se procesa a nivel root:
        // la pregunta de un subagente burbujea al stream del root, y
        // renderizarla también desde el stream del hijo la duplicaba.
        if (depth !== 0) break
        const requests = (d["requests"] ?? []) as Array<Record<string, unknown>>
        for (const request of requests) {
          const action = (request["action"] ?? {}) as Record<string, unknown>
          const input = (action["input"] ?? {}) as Record<string, unknown>
          const prompt = input["prompt"] ?? request["prompt"]
          if (prompt) {
            add({ at, depth, kind: "question", label: String(prompt) })
          }
          // Solo el request del run vivo es respondible desde el composer.
          if (live && request["requestId"]) {
            setPendingInput({
              requestId: String(request["requestId"]),
              prompt: String(prompt ?? ""),
            })
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
            d["message"] ?? d["code"] ?? "Error en la sesión"
          ).slice(0, 300),
        })
        break
    }
  }

  /**
   * Consume el stream de un run. `live: false` = histórico: se reproduce y se
   * corta tras 2.5s sin datos; `live: true` = run actual, conexión abierta.
   * `runIdx` ancla los eventos al bloque de su run en el orden global.
   */
  const consume = async (
    sessionId: string,
    depth: 0 | 1,
    live: boolean,
    runIdx: number
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
            handleEvent(JSON.parse(line) as StreamEvent, depth, live, runIdx)
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

  const startRun = (id: string, live: boolean) => {
    consumedRuns.current.add(id)
    void consume(id, 0, live, runIds.indexOf(id))
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

  // Adjuntos (solo si el host provee upload): al elegirlos quedan staged
  // como Attachments sobre el composer; se suben y viajan CON el mensaje.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<
    Array<{ id: string; file: File; previewUrl: string | null }>
  >([])
  const onFiles = (files: FileList | null) => {
    if (!files?.length || !handlers?.upload) return
    setStaged((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
      })),
    ])
  }
  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const target = prev.find((s) => s.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((s) => s.id !== id)
    })
  }
  const clearStaged = () => {
    setStaged((prev) => {
      for (const s of prev) if (s.previewUrl) URL.revokeObjectURL(s.previewUrl)
      return []
    })
  }

  // Drag & drop en toda el área del chat (solo con upload): los archivos
  // soltados quedan staged igual que con el clip. dragDepth compensa los
  // enter/leave anidados de los hijos.
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files")
  const dndProps = handlers?.upload
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          dragDepth.current += 1
          setDragging(true)
        },
        onDragOver: (e: React.DragEvent) => {
          if (hasFiles(e)) e.preventDefault()
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        },
        onDrop: (e: React.DragEvent) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          onFiles(e.dataTransfer.files)
        },
      }
    : {}

  const onSend = () => {
    const answering = pendingInput
    const files = staged
    startTransition(async () => {
      // Si hay adjuntos: primero se suben, y sus URLs viajan en el texto.
      let text = message
      if (files.length > 0 && handlers?.upload) {
        const up = await handlers.upload(files.map((s) => s.file))
        if (up.formError) {
          toast.error(up.formError)
          return
        }
        const listing = `Te adjunté ${files.length} archivo(s):\n${(up.urls ?? []).join("\n")}`
        text = text.trim() ? `${text.trim()}\n${listing}` : listing
      }
      // Con pregunta pendiente, la respuesta va al input request (reanuda el
      // turno pausado con contexto); si no, mensaje normal a la sesión.
      const result = answering
        ? await (handlers?.answer
            ? handlers.answer(answering.requestId, text, answering.prompt)
            : answerSiteInput(
                siteId,
                answering.requestId,
                text,
                answering.prompt
              ))
        : await (handlers?.send
            ? handlers.send(text)
            : sendSiteMessage(siteId, text))
      if (result?.formError) {
        toast.error(result.formError)
      } else {
        setMessage("")
        clearStaged()
        // La respuesta viaja también como message del turno, así que aparece
        // en el stream como burbuja tuya — sin push local.
        if (answering) setPendingInput(null)
        router.refresh()
      }
      // El foco regresa al composer para seguir la conversación con teclado.
      composerRef.current?.focus()
    })
  }
  const canSend = !pending && (message.trim().length >= 3 || staged.length > 0)

  // Estructura estilo Claude Code:
  // - acciones consecutivas del root → grupo colapsable ("actions")
  // - una delegación a subagente abre un bloque "task"; todo lo depth 1
  //   posterior (tools, reporte, errores) se anida dentro de ese bloque
  // - mensajes/errores/status del root → bloques individuales
  type Block =
    | { key: string; type: "actions"; items: ActivityItem[] }
    | {
        key: string
        type: "task"
        header: ActivityItem | null
        items: ActivityItem[]
      }
    | { key: string; type: "single"; item: ActivityItem }
  const blocks = items.reduce<Block[]>((acc, item) => {
    if (item.depth === 1) {
      const lastTask = [...acc]
        .reverse()
        .find((b): b is Extract<Block, { type: "task" }> => b.type === "task")
      if (lastTask) {
        lastTask.items.push(item)
        return acc
      }
      acc.push({ key: item.id, type: "task", header: null, items: [item] })
      return acc
    }
    if (item.kind === "action" && item.subagentName) {
      acc.push({ key: item.id, type: "task", header: item, items: [] })
      return acc
    }
    if (item.kind === "action") {
      const last = acc[acc.length - 1]
      if (last?.type === "actions") {
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
    <div className="relative flex h-full min-h-0 flex-col" {...dndProps}>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary bg-background/85">
          <div className="flex flex-col items-center gap-1.5 text-sm">
            <PaperclipIcon className="size-5 text-primary" />
            <span className="font-medium">Suelta los archivos aquí</span>
            <span className="text-xs text-muted-foreground">
              Se adjuntan al mensaje para el curador
            </span>
          </div>
        </div>
      )}
      {!hideHeader && (
        <div className="flex shrink-0 items-start justify-between gap-2 p-3">
          <div>
            <h2 className="text-sm font-medium">Monitor de actividad</h2>
            <p className="text-xs text-muted-foreground">
              Revisa que está haciendo el agente, puedes enviarle mensajes
              debajo.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5",
                connected
                  ? "border-none bg-success/30"
                  : "bg-muted-foreground/40"
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
      )}

      {/* scrollEdgeThreshold amplio: imágenes que cargan tarde y collapsibles
          mueven la altura unos px; sin margen, cada brinco saca al scroller
          del modo "siguiendo el fondo". */}
      <MessageScrollerProvider
        defaultScrollPosition="end"
        autoScroll
        scrollEdgeThreshold={120}
      >
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
                  {runIds.length === 0
                    ? "Sin conversación todavía — escríbele abajo para empezar."
                    : "Conectando al stream…"}
                </p>
              ) : (
                blocks.map((block) =>
                  block.type === "actions" ? (
                    <MessageScrollerItem key={block.key} messageId={block.key}>
                      <ActionsBlock items={block.items} />
                    </MessageScrollerItem>
                  ) : block.type === "task" ? (
                    <MessageScrollerItem key={block.key} messageId={block.key}>
                      <TaskBlock header={block.header} items={block.items} />
                    </MessageScrollerItem>
                  ) : (
                    <BlockItem key={block.key} item={block.item} />
                  )
                )
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="flex w-full flex-col">
        {pendingInput && (
          // Pregunta pendiente anclada sobre el composer (estilo Claude Code):
          // lo que escribas abajo la responde directamente.
          <div className="flex shrink-0 items-start gap-2 border-y border-warning/40 bg-warning/5 p-2.5">
            <QuestionIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <div className="max-h-[60dvh] min-w-0 flex-1 overflow-y-auto text-xs">
              <Streamdown className="text-xs leading-relaxed [&_:not(pre)>code]:mx-0 [&_:not(pre)>code]:rounded-sm [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-background [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:text-[11px] [&_p]:my-0.5">
                {pendingInput.prompt}
              </Streamdown>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setPendingInput(null)}
              aria-label="Descartar pregunta (volver a mensaje normal)"
            >
              <XIcon />
            </Button>
          </div>
        )}
        <InputGroup className="shrink-0 border-x-0">
          <InputGroupTextarea
            ref={composerRef}
            placeholder={
              pendingInput
                ? "Responde a la pregunta del agente…"
                : "Escríbele al agente (contexto, cambios, preguntas)…"
            }
            aria-label="Mensaje para el agente"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onPaste={(e) => {
              // Pegar imágenes directo (Cmd+V) cuando hay upload: quedan
              // staged como cualquier adjunto del clip.
              const files = e.clipboardData?.files
              if (files?.length && handlers?.upload) {
                e.preventDefault()
                onFiles(files)
              }
            }}
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
                  value.slice(0, selectionStart) +
                    "\n" +
                    value.slice(selectionEnd)
                )
                requestAnimationFrame(() => {
                  el.selectionStart = el.selectionEnd = selectionStart + 1
                })
              } else if (!e.shiftKey) {
                // Enter: enviar. Shift+Enter conserva el salto nativo.
                e.preventDefault()
                if (canSend) onSend()
              }
            }}
          />
          {staged.length > 0 && (
            <InputGroupAddon align="block-start">
              <AttachmentGroup className="w-full">
                {staged.map((item) => (
                  <Attachment key={item.id} size="sm" state="idle">
                    <AttachmentMedia variant={item.previewUrl ? "image" : "icon"}>
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.previewUrl} alt={item.file.name} />
                      ) : (
                        <FileTextIcon />
                      )}
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{item.file.name}</AttachmentTitle>
                      <AttachmentDescription>
                        {(item.file.size / 1024).toFixed(0)} KB
                      </AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentActions>
                      <AttachmentAction
                        aria-label={`Quitar ${item.file.name}`}
                        onClick={() => removeStaged(item.id)}
                        disabled={pending}
                      >
                        <XIcon />
                      </AttachmentAction>
                    </AttachmentActions>
                  </Attachment>
                ))}
              </AttachmentGroup>
            </InputGroupAddon>
          )}
          <InputGroupAddon align="block-end">
            {handlers?.upload && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.svg,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    onFiles(e.target.files)
                    e.target.value = ""
                  }}
                />
                <InputGroupButton
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending}
                  aria-label="Adjuntar archivos"
                >
                  <PaperclipIcon />
                </InputGroupButton>
              </>
            )}
            <InputGroupButton
              size="icon-sm"
              variant={"default"}
              className="ml-auto"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Enviar mensaje al agente"
            >
              {pending ? <Spinner /> : <PaperPlaneRightIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  )
}

/**
 * Grupo de tool calls colapsable (estilo app de Claude): colapsado muestra
 * solo el estado — la acción en curso con spinner, o "N pasos" al terminar —
 * y al expandir se ve la lista completa de acciones.
 */
function ActionsBlock({ items }: { items: ActivityItem[] }) {
  const running = items.filter((i) => !i.done)
  const active = running.length > 0
  const failed = items.some((i) => i.failed)
  // Colapsado siempre enseña el paso vivo: el que corre ahora (con shimmer)
  // o el último ejecutado.
  const current = running[0] ?? items[items.length - 1]
  const label = current?.label ?? ""

  return (
    <Collapsible
      className={cn(
        "border-l-2 border-border/60 py-0.5 pl-3",
        items[0]?.depth === 1 && "ml-5"
      )}
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left text-xs">
        {/* Sin loader: el shimmer del label ya comunica "en ejecución". */}
        {!active && (
          <span className="flex size-4 shrink-0 items-center justify-center">
            {failed ? (
              <WarningIcon className="text-destructive" />
            ) : (
              <CheckIcon className="text-success" />
            )}
          </span>
        )}
        {active ? (
          <Shimmer className="min-w-0 truncate text-xs font-medium">
            {label}
          </Shimmer>
        ) : (
          <span className="min-w-0 truncate font-medium text-foreground">
            {label}
          </span>
        )}
        {items.length > 1 && (
          <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
            · {items.length}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground/70 tabular-nums">
          {formatTime(current?.at ?? "")}
          <CaretDownIcon
            aria-hidden
            className="size-3 transition-transform group-data-[state=open]:rotate-180"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <MessageGroup className="gap-1.5 pt-1.5">
          {items.map((item) => (
            <ActionRow key={item.id} item={item} />
          ))}
        </MessageGroup>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Fila de tool call estilo Claude Code: icono de la tool + `Label(detalle)`;
 * shimmer mientras corre, rojo si falló. Click expande el input completo.
 */
function ActionRow({ item }: { item: ActivityItem }) {
  const expandable = Boolean(item.inputJson || item.outputJson)
  const running = !item.done
  return (
    <Collapsible>
      <CollapsibleTrigger
        disabled={!expandable}
        className="group/row flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
          {item.failed ? (
            <WarningIcon className="size-3.5 text-destructive" />
          ) : (
            <ToolIcon
              toolName={item.toolName}
              className={cn(
                "size-3.5",
                running ? "text-muted-foreground" : "text-muted-foreground/70"
              )}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            {running && !item.failed ? (
              <Shimmer className="truncate text-xs font-medium">
                {item.label}
              </Shimmer>
            ) : (
              <span
                className={cn(
                  "truncate text-xs font-medium",
                  item.failed ? "text-destructive" : "text-foreground"
                )}
              >
                {item.label}
              </span>
            )}
            {item.detail && (
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                ({item.detail})
              </span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/70 tabular-nums">
          {formatTime(item.at)}
          {/* Siempre ocupa espacio (aunque no sea expandible) para que las
              horas de todas las filas queden alineadas. */}
          <CaretRightIcon
            className={cn(
              "size-3 transition-all",
              expandable
                ? "opacity-0 group-hover/row:opacity-100 group-data-[state=open]/row:rotate-90 group-data-[state=open]/row:opacity-100"
                : "invisible"
            )}
          />
        </span>
      </CollapsibleTrigger>
      {expandable && (
        <CollapsibleContent>
          <div className="mt-1 ml-5 space-y-1.5">
            {item.inputJson && (
              <div>
                <p className="mb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                  Input
                </p>
                <pre className="overflow-x-auto border bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {item.inputJson}
                </pre>
              </div>
            )}
            {item.outputJson && (
              <div>
                <p className="mb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                  Output
                </p>
                <pre
                  className={cn(
                    "overflow-x-auto border bg-background p-2 font-mono text-[10px] leading-relaxed",
                    item.failed ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {item.outputJson}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

/** Reporte interno del subagente al orquestador (dentro de un TaskBlock). */
function ReportItem({ item }: { item: ActivityItem }) {
  // Misma retícula que ActionRow: columna izquierda de 3.5 (línea en vez de
  // icono), contenido flexible y hora alineada a la derecha.
  // Colapsado: 3 líneas. Expandido: el reporte completo en markdown.
  return (
    <Collapsible className="group/report">
      <CollapsibleTrigger className="flex w-full items-stretch gap-2 text-left">
        <span className="flex w-3.5 shrink-0 justify-center">
          <span aria-hidden className="w-0.5 bg-border" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-foreground mb-1">
            Reporte a Agente
          </span>
          <p className="line-clamp-3 text-xs text-muted-foreground group-data-[state=open]/report:line-clamp-none">
            {item.label}
          </p>
        </span>
        <span className="flex shrink-0 items-center gap-1 self-start pt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
          {formatTime(item.at)}
          <CaretRightIcon className="size-3 opacity-0 transition-all group-hover/report:opacity-100 group-data-[state=open]/report:rotate-90 group-data-[state=open]/report:opacity-100" />
        </span>
      </CollapsibleTrigger>
    </Collapsible>
  )
}

/**
 * Bloque de subagente estilo "Task" de Claude Code: la delegación abre un
 * contenedor con la actividad del subagente anidada (tools, reporte, errores).
 * Colapsado muestra el nombre del subagente y su paso vivo.
 */
function TaskBlock({
  header,
  items,
}: {
  header: ActivityItem | null
  items: ActivityItem[]
}) {
  const name = header?.subagentName ?? "subagente"
  const runningChildren = items.filter((i) => i.kind === "action" && !i.done)
  const active = header ? !header.done : runningChildren.length > 0
  const failed =
    Boolean(header?.failed) || items.some((i) => i.failed || i.kind === "error")
  const current = runningChildren[0]

  return (
    <Collapsible className="border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 bg-sidebar p-2 text-left text-xs">
        <RobotIcon
          className={cn(
            "size-3.5 shrink-0",
            failed ? "text-destructive" : "text-muted-foreground"
          )}
        />
        <span className="shrink-0 font-medium text-foreground">{name}</span>
        {active ? (
          <Shimmer className="min-w-0 truncate text-xs">
            {current?.label ?? "Trabajando…"}
          </Shimmer>
        ) : (
          <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
            {failed ? (
              <WarningIcon className="size-3 shrink-0 text-destructive" />
            ) : (
              <CheckIcon className="size-3 shrink-0 text-success" />
            )}
            <span className="truncate">
              {items.filter((i) => i.kind === "action").length} acciones
            </span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground/70 tabular-nums">
          {formatTime((header ?? items[0])?.at ?? "")}
          <CaretDownIcon
            aria-hidden
            className="size-3 transition-transform group-data-[state=open]:rotate-180"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-t border-border p-2 pl-3">
          {items.map((item) =>
            item.kind === "action" ? (
              <ActionRow key={item.id} item={item} />
            ) : item.kind === "report" ? (
              <ReportItem key={item.id} item={item} />
            ) : item.kind === "error" ? (
              <p key={item.id} className="text-xs text-destructive">
                {item.label}
              </p>
            ) : (
              <p key={item.id} className="text-[11px] text-muted-foreground">
                {item.label}
              </p>
            )
          )}
          {items.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Delegado; esperando actividad…
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Bloques individuales: mensajes tuyos/del agente, errores y status. */
function BlockItem({ item }: { item: ActivityItem }) {
  return (
    <MessageScrollerItem messageId={item.id}>
      {item.kind === "user" ? (
        (() => {
          const { quote, text, images } = parseUserReply(item.label)
          return (
            <Message align="end">
              <MessageContent>
                <MessageHeader className="justify-end">
                  Tú · {formatTime(item.at)}
                </MessageHeader>
                {quote && (
                  // Cita fuera de la burbuja (estilo iMessage): la pregunta
                  // arriba, discreta; tu respuesta en la burbuja.
                  <BubbleQuote className="max-w-[80%] self-end border-border bg-muted/60 text-muted-foreground">
                    {quote}
                  </BubbleQuote>
                )}
                {images.length > 0 && (
                  // Adjuntos como thumbnails (estilo app de Claude), no URLs.
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {images.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block size-16 overflow-hidden border bg-background"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt="Adjunto"
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                )}
                {text && (
                  <Bubble variant="default" align="end">
                    <BubbleContent>{text}</BubbleContent>
                  </Bubble>
                )}
              </MessageContent>
            </Message>
          )
        })()
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
                <Streamdown className="text-xs leading-relaxed [&_:not(pre)>code]:mx-0 [&_:not(pre)>code]:rounded-none [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-background [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:text-[11px] [&_:not(pre)>code]:whitespace-nowrap [&_blockquote]:my-1.5 [&_h1]:my-1.5 [&_h1]:text-sm [&_h2]:my-1.5 [&_h2]:text-sm [&_h3]:my-1 [&_h3]:text-xs [&_h4]:my-1 [&_h4]:text-xs [&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_pre]:my-1.5 [&_pre]:text-[11px] [&_table]:text-xs [&_ul]:my-1">
                  {item.label}
                </Streamdown>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : item.kind === "report" ? (
        // Normalmente vive dentro de un TaskBlock; standalone como fallback.
        <div className="ml-5">
          <ReportItem item={item} />
        </div>
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
                <Streamdown className="text-xs leading-relaxed [&_:not(pre)>code]:mx-0 [&_:not(pre)>code]:rounded-none [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-background [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:text-[11px] [&_:not(pre)>code]:whitespace-nowrap [&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1">
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
