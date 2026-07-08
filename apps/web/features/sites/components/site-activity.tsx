"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowBendUpLeftIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowsOutSimpleIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  PaperclipIcon,
  PaperPlaneRightIcon,
  QuestionIcon,
  AirTrafficControlIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react"

import { toast } from "sonner"

import { answerSiteInput, sendSiteMessage } from "@/features/sites/actions"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { ClaudeAI, DeepSeek, GLM, Icon, OpenAI, Qwen } from "@/components/icons"
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
import {
  Bubble,
  BubbleContent,
  BubbleQuote,
  BubbleReactions,
} from "@/components/ui/bubble"
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
import { Skeleton } from "@/components/ui/skeleton"
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
  kind:
    | "action"
    | "text"
    | "report"
    | "delegation"
    | "user"
    | "status"
    | "error"
    | "question"
  label: string
  detail?: string
  callId?: string
  done?: boolean
  failed?: boolean
  /** Opciones de una pregunta HITL (ask_question con options). */
  options?: string[]
  /** Opción que el humano eligió (marca la pregunta como respondida). */
  chosen?: string
  /** Nombre crudo de la tool (para icono y agrupación). */
  toolName?: string
  /** Input completo de la tool (JSON legible) para el detalle expandible. */
  inputJson?: string
  /** edit_file: el parche (oldString→newString) para render como diff. */
  diff?: {
    path?: string
    oldString: string
    newString: string
    replaceAll?: boolean
  }
  /** Output de la tool (action.result) para el detalle expandible. */
  outputJson?: string
  /** Presente cuando la acción es una delegación a subagente. */
  subagentName?: string
  /** modelId del runtime de la sesión que emitió el evento (session.started). */
  model?: string
  /** `turnId:stepIndex` del step que generó este item — llave para pegarle el
   *  usage de tokens cuando llegue su `step.completed` (mismo step). */
  stepKey?: string
  /** Tokens del STEP que produjo este item (una llamada al modelo). El input
   *  YA incluye los leídos de caché; `cacheRead` los desglosa para el tooltip. */
  tokens?: { input: number; output: number; cacheRead: number }
}

interface StreamEvent {
  type: string
  data?: Record<string, unknown>
  meta?: { at?: string }
}

// Suficiente para reproducir cadenas largas de runs sin recortar en vivo
// (recortar durante el replay hacía "bailar" los items).
const MAX_ITEMS = 600

// Labels, iconos y badges de modelo viven en el módulo COMPARTIDO
// lib/tool-activity (una sola fuente para site-activity y chat-activity).
export { describeAction } from "@/lib/tool-activity"
import { describeAction, ToolIcon, TOOL_MODEL } from "@/lib/tool-activity"

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
    /^Respondiendo a (?:la pregunta pendiente|tu mensaje) \(«([\s\S]+?)»\):\s*([\s\S]*)$/
  )
  if (!match) return { text, images }
  return { quote: match[1], text: match[2], images }
}

/** Acciones de burbuja estilo app de chat: copiar y responder con cita. */
function BubbleActions({
  text,
  onReply,
}: {
  text: string
  onReply?: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/msg:opacity-100 md:has-[:focus-visible]:opacity-100">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Copiar mensaje"
        onClick={() => {
          void navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      </Button>
      {onReply && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Responder a este mensaje"
          onClick={onReply}
        >
          <ArrowBendUpLeftIcon />
        </Button>
      )}
    </div>
  )
}

function formatTime(at: string): string {
  if (!at) return ""
  return formatTimeInUserTz(at)
}

// Al estilo Claude Code: el "pensando" rota entre gerundios con carácter.
const THINKING_WORDS = [
  "Pensando",
  "Maquinando",
  "Cavilando",
  "Rumiando",
  "Cocinando",
  "Horneando",
  "Tramando",
  "Puliendo",
  "Garabateando",
  "Destilando",
  "Afinando",
  "Barajando opciones",
  "Conectando puntos",
  "Desenredando",
  "Aterrizando ideas",
  "Dándole vueltas",
  "Hilando fino",
  "Meditando",
  "Calibrando",
  "Esbozando",
  "Tejiendo",
  "Contemplando",
  "Descifrando",
  "Orquestando",
]

/** "Pensando…" con palabra rotativa mientras el root genera. */
function ThinkingIndicator() {
  const [word, setWord] = useState(
    () => THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)]
  )
  useEffect(() => {
    const interval = setInterval(() => {
      setWord((prev) => {
        let next = prev
        while (next === prev) {
          next =
            THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)]
        }
        return next
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [])
  return <Shimmer className="text-xs font-medium">{`${word}…`}</Shimmer>
}

/** Badge discreto con el modelo que emitió el mensaje (icono por proveedor). */
function ModelBadge({ model }: { model?: string }) {
  if (!model) return null
  const short = model.split("/").pop() ?? model
  const isClaude = /claude/i.test(model)
  const isQwen = /qwen/i.test(model)
  const isGLM = /glm|zai/i.test(model)
  const isDeepSeek = /deepseek/i.test(model)
  const isOpenAI = /gpt|openai|o\d/i.test(model)
  return (
    <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground/70">
      {isClaude ? (
        <ClaudeAI className="size-3 shrink-0" />
      ) : isQwen ? (
        <Qwen className="size-3 shrink-0" />
      ) : isGLM ? (
        <GLM className="size-3 shrink-0" />
      ) : isDeepSeek ? (
        <DeepSeek className="size-3 shrink-0" />
      ) : isOpenAI ? (
        <OpenAI className="size-3 shrink-0 fill-current" />
      ) : null}
      {short}
    </span>
  )
}

/** 1234 → "1.2k", 45678 → "46k", 1.2e6 → "1.2M". Compacto para el badge. */
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/**
 * Tokens de UN step (una llamada al modelo), estilo Claude Code: ↑ entrada
 * ↓ salida. El input incluye el contexto cacheado; el tooltip lo desglosa.
 */
function TokenBadge({ tokens }: { tokens?: ActivityItem["tokens"] }) {
  if (!tokens) return null
  const { input, output, cacheRead } = tokens
  if (!input && !output) return null
  return (
    <span
      className="flex items-center gap-0.5 text-[10px] font-normal tabular-nums text-muted-foreground/60"
      title={`Entrada ${input.toLocaleString("es-MX")} tok${
        cacheRead ? ` (${cacheRead.toLocaleString("es-MX")} de caché)` : ""
      } · Salida ${output.toLocaleString("es-MX")} tok`}
    >
      <ArrowUpIcon className="size-2.5 shrink-0" weight="bold" />
      {formatTokens(input)}
      <ArrowDownIcon className="ml-0.5 size-2.5 shrink-0" weight="bold" />
      {formatTokens(output)}
    </span>
  )
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
  title = "Monitor de actividad",
  description = "Revisa que está haciendo el agente, puedes enviarle mensajes debajo.",
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
  /** Título y subtítulo del header (default: monitor del sitio). */
  title?: string
  description?: string
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
  // Cursor de eventos ya consumidos por sesión: el stream de eve es durable y
  // replayable (?startIndex=n), así que reconectar desde el cursor retoma
  // exactamente donde se cortó sin duplicar eventos.
  const streamCursors = useRef<Map<string, number>>(new Map())
  // Sesiones que emitieron su evento terminal: no se reconectan más.
  const terminalSessions = useRef<Set<string>>(new Set())
  // Despertadores de los sleeps de backoff: al volver a la pestaña la
  // reconexión es inmediata en vez de esperar el timer.
  const reconnectKicks = useRef<Set<() => void>>(new Set())
  const runIdsKey = runIds.join(",")

  const [historyLoaded, setHistoryLoaded] = useState(false)
  // Pregunta HITL pendiente del run vivo: el composer responde al request
  // (con contexto) en vez de mandar un mensaje suelto al root.
  const [pendingInput, setPendingInput] = useState<{
    requestId: string
    prompt: string
    options: string[]
    allowFreeform: boolean
  } | null>(null)
  // "Responder" a un mensaje del agente: la cita viaja en el texto (contexto
  // para el agente) y se renderiza como BubbleQuote.
  const [replyTo, setReplyTo] = useState<string | null>(null)
  // El root está generando (entre eventos no hay nada visible: p. ej. tras
  // el reporte del subagente, mientras redacta su respuesta) → "Pensando…".
  const [rootBusy, setRootBusy] = useState(false)
  // "Entrar" a un subagente: su TaskBlock se abre como chat full read-only.
  // Guarda la key del block (header.id, estable); la vista se re-deriva de
  // `blocks` en cada render, así que sigue viva mientras el subagente trabaja.
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  useEffect(() => {
    lifetimeAbort.current = new AbortController()
    return () => lifetimeAbort.current?.abort()
  }, [])

  // Volver a la pestaña = reconectar YA los streams en backoff (mientras la
  // pestaña estuvo oculta la conexión suele morir por timeout del server).
  useEffect(() => {
    const kick = () => {
      if (document.visibilityState !== "visible") return
      for (const wake of [...reconnectKicks.current]) wake()
    }
    document.addEventListener("visibilitychange", kick)
    window.addEventListener("focus", kick)
    return () => {
      document.removeEventListener("visibilitychange", kick)
      window.removeEventListener("focus", kick)
    }
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
    runIdx: number,
    sessionMeta: { model?: string }
  ) => {
    const d = event.data ?? {}
    const at = event.meta?.at ?? ""
    // Llave del step (turnId:stepIndex): correlaciona los items que este step
    // generó (actions.requested / message.completed) con su usage de tokens,
    // que llega aparte en step.completed del MISMO step. depth entra en la
    // llave porque root y subagente numeran sus steps por separado.
    const stepKey =
      d["turnId"] != null && d["stepIndex"] != null
        ? `${depth}:${d["turnId"]}:${d["stepIndex"]}`
        : undefined
    if (event.type === "session.started") {
      const runtime = (d["runtime"] ?? {}) as Record<string, unknown>
      if (runtime["modelId"]) sessionMeta.model = String(runtime["modelId"])
      return
    }
    // Indicador "Pensando…" del root (solo run vivo): ocupado desde que
    // arranca turno/step; libre cuando responde, pregunta, espera o falla.
    if (live && depth === 0) {
      if (
        event.type === "turn.started" ||
        event.type === "step.started" ||
        event.type === "message.received"
      ) {
        setRootBusy(true)
      } else if (
        event.type === "message.completed" ||
        event.type === "input.requested" ||
        event.type === "session.waiting" ||
        event.type === "turn.completed" ||
        event.type === "turn.failed" ||
        event.type === "session.failed" ||
        event.type === "step.failed"
      ) {
        setRootBusy(false)
      }
    }
    // Orden cronológico REAL: (run, timestamp del evento). Ordenar por llegada
    // desordenaba root vs subagente (streams paralelos, replay a ritmos
    // distintos). Empates conservan orden de llegada (sort estable).
    const add = (item: Omit<ActivityItem, "id" | "sortKey" | "model">) =>
      push({
        ...item,
        model: sessionMeta.model,
        sortKey: runIdx * 1e13 + (Date.parse(at) || 0),
      })
    switch (event.type) {
      case "actions.requested": {
        const actions = (d["actions"] ?? []) as Array<Record<string, unknown>>
        for (const action of actions) {
          const { label, detail, toolName, subagentName } =
            describeAction(action)
          const input = (action["input"] ?? {}) as Record<string, unknown>
          // edit_file: se extrae el parche a un campo dedicado (con presupuesto
          // propio) para renderizarlo como diff rojo/verde en vez de JSON crudo.
          let diff: ActivityItem["diff"] | undefined
          if (
            toolName === "edit_file" &&
            typeof input["oldString"] === "string" &&
            typeof input["newString"] === "string"
          ) {
            const cap = (s: unknown) => String(s ?? "").slice(0, 4000)
            diff = {
              path: input["path"] ? String(input["path"]) : undefined,
              oldString: cap(input["oldString"]),
              newString: cap(input["newString"]),
              replaceAll: input["replaceAll"] === true,
            }
          }
          let inputJson: string | undefined
          // Con diff dedicado el JSON crudo es redundante (y enorme): se omite.
          if (!diff) {
            try {
              const raw = JSON.stringify(input, null, 2)
              inputJson = raw === "{}" ? undefined : raw.slice(0, 2000)
            } catch {
              inputJson = undefined
            }
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
            diff,
            callId: action["callId"] ? String(action["callId"]) : undefined,
            done: false,
            stepKey,
          })
        }
        break
      }
      case "step.completed": {
        // Usage del step (una llamada al modelo). Se lo pega al PRIMER item que
        // generó este step (mismo stepKey) — típicamente su tool row. Un step
        // secuencial = 1 tool = 1 fila con sus tokens; un step con varias tools
        // en paralelo carga el costo en la primera (fue la misma inferencia).
        const usage = d["usage"] as
          | {
              inputTokens?: number
              outputTokens?: number
              cacheReadTokens?: number
            }
          | undefined
        if (!usage || !stepKey) break
        const input = usage.inputTokens ?? 0
        const output = usage.outputTokens ?? 0
        if (input === 0 && output === 0) break
        const tokens = {
          input,
          output,
          cacheRead: usage.cacheReadTokens ?? 0,
        }
        setItems((prev) => {
          const idx = prev.findIndex((it) => it.stepKey === stepKey && !it.tokens)
          if (idx === -1) return prev
          return prev.map((it, i) => (i === idx ? { ...it, tokens } : it))
        })
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
        if (depth === 0 && d["message"]) {
          add({ at, depth, kind: "user", label: String(d["message"]) })
          // Si la respuesta matchea una opción de la última pregunta con
          // opciones, se marca como elegida (el historial muestra solo esa).
          {
            const answer = parseUserReply(String(d["message"]))
              .text.trim()
              .toLowerCase()
            if (answer) {
              setItems((prev) => {
                for (let i = prev.length - 1; i >= 0; i--) {
                  const it = prev[i]
                  if (it.kind !== "question" || !it.options?.length) continue
                  const chosen = it.options.find(
                    (o) => o.trim().toLowerCase() === answer
                  )
                  if (!chosen || it.chosen) return prev
                  return prev.map((p, j) => (j === i ? { ...p, chosen } : p))
                }
                return prev
              })
            }
          }
        } else if (depth !== 0 && d["message"]) {
          // El prompt de delegación del orquestador al subagente: visible
          // como encargo dentro del TaskBlock (simétrico al reporte).
          add({ at, depth, kind: "delegation", label: String(d["message"]) })
        }
        break
      case "message.completed":
        if (d["message"]) {
          // Solo el root te habla a ti (burbuja de chat). El mensaje final
          // del subagente es su reporte interno al orquestador: se muestra
          // como actividad discreta, no como chat.
          // El bloque <sugerencias> del root alimenta los chips del chat
          // del dashboard: aquí solo se limpia para no ensuciar la burbuja.
          add({
            at,
            depth,
            kind: depth === 0 ? "text" : "report",
            label: String(d["message"])
              .replace(/<sugerencias>[\s\S]*?<\/sugerencias>\s*$/i, "")
              .trim(),
            stepKey,
          })
        }
        break
      case "result.completed": {
        // Subagente en task mode: su reporte es JSON estructurado
        // (outputSchema), no prosa — se muestra como reporte formateado.
        if (depth === 0 || d["result"] === undefined) break
        let pretty: string
        try {
          pretty = JSON.stringify(d["result"], null, 2)
        } catch {
          pretty = String(d["result"])
        }
        // Resultado vacío ({} — p. ej. un task mode forzado con schema
        // basura): no hay nada que reportar, no ensuciar el timeline.
        if (pretty === "{}" || pretty === "null" || pretty === '""') break
        add({
          at,
          depth,
          kind: "report",
          label: `\`\`\`json\n${pretty.slice(0, 4000)}\n\`\`\``,
          stepKey,
        })
        break
      }
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
          // ask_question puede traer opciones: strings o {id, label}.
          const rawOptions = (input["options"] ??
            request["options"] ??
            []) as unknown[]
          const options = (Array.isArray(rawOptions) ? rawOptions : [])
            .map((o) =>
              typeof o === "string"
                ? o
                : String(
                    (o as Record<string, unknown>)["label"] ??
                      (o as Record<string, unknown>)["id"] ??
                      ""
                  )
            )
            .filter(Boolean)
          const allowFreeform = input["allowFreeform"] !== false
          if (prompt) {
            add({ at, depth, kind: "question", label: String(prompt), options })
          }
          // Solo el request del run vivo es respondible desde el composer.
          if (live && request["requestId"]) {
            setPendingInput({
              requestId: String(request["requestId"]),
              prompt: String(prompt ?? ""),
              options,
              allowFreeform,
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
   * corta tras 2.5s sin datos; `live: true` = run actual, conexión abierta
   * CON reconexión automática: si el fetch muere (timeout serverless, red,
   * sleep de la laptop), se reataca el stream durable con ?startIndex=cursor
   * y sigue exactamente donde quedó — sin heartbeats ni duplicados.
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
    // Modelo de ESTA sesión (root o hijo), llenado por su session.started.
    const sessionMeta: { model?: string } = {}
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
    let backoff = 1_000
    try {
      for (;;) {
        if (local.signal.aborted) break
        let received = 0
        try {
          const cursor = streamCursors.current.get(sessionId) ?? 0
          const res = await fetch(
            `/eve/v1/session/${sessionId}/stream${cursor > 0 ? `?startIndex=${cursor}` : ""}`,
            { signal: local.signal }
          )
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
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
              // Cada línea completa es un evento del índice del server: el
              // cursor avanza aunque el parse falle, para no re-pedirla.
              streamCursors.current.set(
                sessionId,
                (streamCursors.current.get(sessionId) ?? 0) + 1
              )
              received += 1
              try {
                const event = JSON.parse(line) as StreamEvent
                if (
                  event.type === "session.completed" ||
                  event.type === "session.failed"
                ) {
                  terminalSessions.current.add(sessionId)
                }
                handleEvent(event, depth, live, runIdx, sessionMeta)
              } catch {
                // línea corrupta: ignorar
              }
            }
          }
        } catch {
          // abort (idle o unmount) o red: el guard de abajo decide
        }
        // Históricos, unmount/sustitución, o sesión terminada: no reconectar.
        if (!live || local.signal.aborted) break
        if (terminalSessions.current.has(sessionId)) break
        if (depth === 0) setConnected(false)
        // Backoff: inmediato si venían llegando eventos; hasta 15s en reposo.
        backoff = received > 0 ? 1_000 : Math.min(backoff * 2, 15_000)
        await new Promise<void>((resolve) => {
          const wake = () => {
            clearTimeout(timer)
            reconnectKicks.current.delete(wake)
            resolve()
          }
          const timer = setTimeout(wake, backoff)
          reconnectKicks.current.add(wake)
          local.signal.addEventListener("abort", wake, { once: true })
        })
      }
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
    const claimed = consumedRuns.current
    if (!lastRunId || claimed.has(lastRunId)) return
    startRun(lastRunId, true)
    return () => {
      // StrictMode (dev) desmonta/remonta: liberar el claim SÍNCRONO aquí
      // (un delete en el finally async del consume llega tarde — el segundo
      // effect corre antes que la microtask). El cursor por sesión evita
      // duplicados si algo alcanzó a procesarse antes del abort.
      claimed.delete(lastRunId)
    }
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
    const quoting = replyTo
    startTransition(async () => {
      // Si hay adjuntos: primero se suben, y sus URLs viajan en el texto.
      let text = message
      if (quoting && !answering && text.trim()) {
        text = `Respondiendo a tu mensaje («${quoting.slice(0, 240)}»): ${text}`
      }
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
        setReplyTo(null)
        // La respuesta viaja también como message del turno, así que aparece
        // en el stream como burbuja tuya — sin push local.
        if (answering) setPendingInput(null)
        router.refresh()
      }
      // El foco regresa al composer para seguir la conversación con teclado.
      composerRef.current?.focus()
    })
  }
  const canSend = !pending && (message.trim().length > 0 || staged.length > 0)

  // Clic en una opción de la pregunta: la respuesta ES el label (eve
  // resuelve follow-ups que matchean label/id/índice de opción).
  const answerOption = (label: string) => {
    const answering = pendingInput
    if (!answering) return
    startTransition(async () => {
      const result = await (handlers?.answer
        ? handlers.answer(answering.requestId, label, answering.prompt)
        : answerSiteInput(siteId, answering.requestId, label, answering.prompt))
      if (result?.formError) {
        toast.error(result.formError)
      } else {
        setPendingInput(null)
        router.refresh()
      }
    })
  }

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

  // Block del subagente en foco (si "entraste"): se re-deriva de `blocks`
  // cada render → el overlay recibe items vivos sin re-abrir streams.
  const focusedBlock = focusedKey
    ? blocks.find(
        (b): b is Extract<Block, { type: "task" }> =>
          b.type === "task" && b.key === focusedKey
      )
    : undefined

  return (
    <div className="relative flex h-full min-h-0 flex-col" {...dndProps}>
      {focusedBlock && (
        <SubagentFocus
          name={focusedBlock.header?.subagentName ?? "subagente"}
          header={focusedBlock.header}
          items={focusedBlock.items}
          onBack={() => setFocusedKey(null)}
        />
      )}
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
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-1">
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5",
                connected
                  ? "border-none bg-success/30"
                  : rootBusy
                    ? "border-none bg-warning/30"
                    : "bg-muted-foreground/40"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  connected
                    ? "animate-pulse bg-success"
                    : rootBusy
                      ? "animate-pulse bg-warning"
                      : "bg-muted-foreground/40"
                )}
              />
              {connected ? "En vivo" : rootBusy ? "Reconectando…" : "Dormido"}
            </Badge>
            {onClose && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                aria-label="Cerrar monitor de actividad"
                // Solo mobile: en desktop el panel se cierra con su trigger
                // del header de la página.
                className="md:hidden"
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
                runIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin conversación todavía — escríbele abajo para empezar.
                  </p>
                ) : (
                  // Replay en camino: esqueleto de conversación.
                  <div className="space-y-5">
                    <div className="flex justify-end">
                      <Skeleton className="h-14 w-3/5" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-20 w-4/5" />
                    </div>
                    <Skeleton className="h-9 w-full" />
                  </div>
                )
              ) : (
                blocks.map((block) =>
                  block.type === "actions" ? (
                    <MessageScrollerItem key={block.key} messageId={block.key}>
                      <ActionsBlock items={block.items} />
                    </MessageScrollerItem>
                  ) : block.type === "task" ? (
                    <MessageScrollerItem key={block.key} messageId={block.key}>
                      <TaskBlock
                        header={block.header}
                        items={block.items}
                        onFocus={() => setFocusedKey(block.key)}
                      />
                    </MessageScrollerItem>
                  ) : (
                    <BlockItem
                      key={block.key}
                      item={block.item}
                      onReply={(text) => {
                        setReplyTo(text)
                        composerRef.current?.focus()
                      }}
                    />
                  )
                )
              )}
              {rootBusy && (
                <MessageScrollerItem scrollAnchor={false}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3" />
                    <ThinkingIndicator />
                  </div>
                </MessageScrollerItem>
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
        {pendingInput && pendingInput.options.length > 0 && (
          // Opciones como botones (estilo app de Claude): un clic responde.
          // El textarea de abajo sigue siendo el "Otro" (respuesta libre).
          <div className="flex shrink-0 flex-col gap-1.5 border-b p-2.5">
            {pendingInput.options.map((option) => (
              <Button
                key={option}
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => answerOption(option)}
                className="h-auto justify-start px-3 py-2 text-left text-xs font-normal whitespace-normal"
              >
                {option}
              </Button>
            ))}
            {pendingInput.allowFreeform && (
              <p className="px-1 pt-0.5 text-[11px] text-muted-foreground">
                O escribe otra respuesta abajo.
              </p>
            )}
          </div>
        )}
        {replyTo && !pendingInput && (
          // Cita activa: el mensaje del agente al que respondes, con X.
          <div className="flex items-start gap-2 border-t bg-muted/40 px-3 py-2">
            <ArrowBendUpLeftIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p className="line-clamp-2 min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
              {replyTo}
            </p>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setReplyTo(null)}
              aria-label="Quitar cita"
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
                    <AttachmentMedia
                      variant={item.previewUrl ? "image" : "icon"}
                    >
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
    <Collapsible className="border-l-2 border-border/60 py-0.5 pl-3">
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
 * Diff de un edit_file: el bloque reemplazado (oldString) en rojo con `-` y el
 * nuevo (newString) en verde con `+`. No es un diff LCS: str_replace ES
 * "cambia este bloque por este otro", así que mostrarlos apilados es fiel.
 * Cada lado se recorta a MAX_LINES para no reventar el timeline.
 */
function DiffBlock({ diff }: { diff: NonNullable<ActivityItem["diff"]> }) {
  const MAX_LINES = 40
  const clamp = (text: string): string[] => {
    if (!text.length) return []
    const lines = text.split("\n")
    return lines.length > MAX_LINES
      ? [
          ...lines.slice(0, MAX_LINES),
          `… (+${lines.length - MAX_LINES} líneas)`,
        ]
      : lines
  }
  const oldLines = clamp(diff.oldString)
  const newLines = clamp(diff.newString)
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
        Diff
        {diff.path && (
          <span className="font-mono tracking-normal text-muted-foreground normal-case">
            {diff.path}
          </span>
        )}
        {diff.replaceAll && (
          <span className="tracking-normal normal-case">
            · todas las coincidencias
          </span>
        )}
      </p>
      <pre className="overflow-x-auto border bg-background font-mono text-[10px] leading-relaxed">
        {/* Wrapper w-max: se estira al ancho de la línea MÁS LARGA (min 100% del
            visible); cada línea (block) llena ESE ancho, así el fondo rojo/verde
            abarca todo el scroll horizontal en vez de cortarse a la derecha.
            (min-w-full en cada línea no basta: resuelve al ancho VISIBLE del
            pre, no al del scroll.) */}
        <div className="w-max min-w-full">
          {oldLines.map((line, i) => (
            <div
              key={`o${i}`}
              className="bg-destructive/10 px-2 text-destructive"
            >
              <span aria-hidden className="mr-1 opacity-50 select-none">
                −
              </span>
              {line || " "}
            </div>
          ))}
          {newLines.map((line, i) => (
            <div key={`n${i}`} className="bg-success/10 px-2 text-success">
              <span aria-hidden className="mr-1 opacity-50 select-none">
                +
              </span>
              {line || " "}
            </div>
          ))}
          {newLines.length === 0 && (
            <div className="px-2 text-muted-foreground/60 italic">
              (fragmento eliminado)
            </div>
          )}
        </div>
      </pre>
    </div>
  )
}

/**
 * Fila de tool call estilo Claude Code: icono de la tool + `Label(detalle)`;
 * shimmer mientras corre, rojo si falló. Click expande el input completo.
 */
function ActionRow({ item }: { item: ActivityItem }) {
  const expandable = Boolean(
    item.inputJson || item.outputJson || item.diff || item.detail
  )
  const running = !item.done
  // Modelo interno de la tool (draft_section→qwen, review→sonnet…), o el del
  // orquestador (item.model) si la tool corre código puro.
  const model =
    (item.toolName ? TOOL_MODEL[item.toolName] : undefined) ?? item.model
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
          {/* Solo el nombre de la tool en el row colapsado; el detalle/args
              (item.detail) vive ahora en el bloque Input al expandir. */}
          {running && !item.failed ? (
            <Shimmer className="block truncate text-xs font-medium">
              {item.label}
            </Shimmer>
          ) : (
            <span
              className={cn(
                "block truncate text-xs font-medium",
                item.failed ? "text-destructive" : "text-foreground"
              )}
            >
              {item.label}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground/70 tabular-nums">
          {formatTime(item.at)}
          {/* Tokens del step que generó esta fila (una llamada al modelo). */}
          <TokenBadge tokens={item.tokens} />
          {/* Modelo que usa la tool (solo las que llaman a un modelo por dentro),
              pegado al chevron del colapsable. */}
          <ModelBadge model={model} />
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
            {item.diff && <DiffBlock diff={item.diff} />}
            {/* Detalle/args del row colapsado: ahora solo al expandir. Si hay
                inputJson estructurado, ese lo cubre; si no, se muestra aquí. */}
            {!item.inputJson && item.detail && (
              <pre className="overflow-x-auto border bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {item.detail}
              </pre>
            )}
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
          <p className="line-clamp-3 text-xs text-muted-foreground group-data-[state=open]/report:line-clamp-none">
            {item.label}
          </p>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 self-start pt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
          {formatTime(item.at)}
          <TokenBadge tokens={item.tokens} />
          <CaretRightIcon className="size-3 opacity-0 transition-all group-hover/report:opacity-100 group-data-[state=open]/report:rotate-90 group-data-[state=open]/report:opacity-100" />
        </span>
      </CollapsibleTrigger>
    </Collapsible>
  )
}

/** Encargo del orquestador al subagente (el prompt de delegación). */
function DelegationItem({ item }: { item: ActivityItem }) {
  // Misma retícula que ReportItem; el prefijo lo distingue del reporte.
  return (
    <Collapsible className="group/delegation">
      <CollapsibleTrigger className="flex w-full items-stretch gap-2 text-left">
        <span className="flex w-3.5 shrink-0 justify-center">
          <span aria-hidden className="w-0.5 bg-border" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs text-muted-foreground/80 italic group-data-[state=open]/delegation:line-clamp-none">
            <span className="font-medium not-italic">Encargo:</span>{" "}
            {item.label}
          </p>
        </span>
        <span className="flex shrink-0 items-center gap-1 self-start pt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
          {formatTime(item.at)}
          <CaretRightIcon className="size-3 opacity-0 transition-all group-hover/delegation:opacity-100 group-data-[state=open]/delegation:rotate-90 group-data-[state=open]/delegation:opacity-100" />
        </span>
      </CollapsibleTrigger>
    </Collapsible>
  )
}

/**
 * Transcript textual completo de un bloque de subagente (encargo, cada tool
 * con input/output íntegros, reportes, errores) para copiar al portapapeles.
 */
function taskTranscript(
  name: string,
  header: ActivityItem | null,
  items: ActivityItem[]
): string {
  const model = items.find((i) => i.model)?.model
  const lines: string[] = [`## Subagente ${name}${model ? ` (${model})` : ""}`]
  if (header) {
    lines.push(
      `Delegado a las ${formatTime(header.at)}${
        header.failed ? " — FALLÓ" : header.done ? "" : " — en curso"
      }`
    )
  }
  for (const item of items) {
    lines.push("")
    const time = formatTime(item.at)
    switch (item.kind) {
      case "delegation":
        lines.push(`[${time}] ENCARGO:`, item.label)
        break
      case "report":
        lines.push(`[${time}] REPORTE:`, item.label)
        break
      case "error":
        lines.push(`[${time}] ERROR: ${item.label}`)
        break
      case "question": {
        lines.push(`[${time}] PREGUNTA: ${item.label}`)
        if (item.options?.length)
          lines.push(`  opciones: ${item.options.join(" | ")}`)
        if (item.chosen) lines.push(`  respuesta: ${item.chosen}`)
        break
      }
      case "action": {
        const status = item.failed ? " [ERROR]" : item.done ? "" : " [en curso]"
        lines.push(
          `[${time}] ${item.toolName ?? "acción"}${status} — ${item.label}${
            item.detail ? ` (${item.detail})` : ""
          }`
        )
        if (item.diff) {
          lines.push(`  diff${item.diff.path ? ` (${item.diff.path})` : ""}:`)
          for (const l of item.diff.oldString.split("\n"))
            lines.push(`  - ${l}`)
          for (const l of item.diff.newString.split("\n"))
            lines.push(`  + ${l}`)
        } else if (item.inputJson) {
          lines.push(`  input: ${item.inputJson}`)
        }
        if (item.outputJson) lines.push(`  output: ${item.outputJson}`)
        break
      }
      default:
        lines.push(`[${time}] ${item.label}`)
    }
  }
  return lines.join("\n")
}

/** Botón de copiar la actividad completa de un TaskBlock, con feedback. */
function CopyTaskButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Copiar toda la actividad del subagente"
      className="shrink-0 text-muted-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(getText())
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
    </Button>
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
  onFocus,
}: {
  header: ActivityItem | null
  items: ActivityItem[]
  /** "Entrar" al subagente: abre su transcript como chat full read-only. */
  onFocus?: () => void
}) {
  const name = header?.subagentName ?? "subagente"
  const runningChildren = items.filter((i) => i.kind === "action" && !i.done)
  const active = header ? !header.done : runningChildren.length > 0
  const failed =
    Boolean(header?.failed) || items.some((i) => i.failed || i.kind === "error")
  const current = runningChildren[0]

  return (
    <Collapsible className="border">
      {/* El trigger es un <button>: el botón de copiar va como hermano
          (button anidado en button es HTML inválido). */}
      <div className="flex w-full items-center bg-sidebar pr-1">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 p-2 text-left text-xs">
          <AirTrafficControlIcon
            className={cn(
              "size-3.5 shrink-0",
              failed ? "text-destructive" : "text-muted-foreground"
            )}
          />
          <span className="shrink-0 font-medium text-foreground">{name}</span>
          <ModelBadge model={items.find((i) => i.model)?.model} />
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
        {onFocus && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Entrar a ${name} (ver su chat completo)`}
            className="shrink-0 text-muted-foreground"
            onClick={onFocus}
          >
            <ArrowsOutSimpleIcon />
          </Button>
        )}
        <CopyTaskButton getText={() => taskTranscript(name, header, items)} />
      </div>
      <CollapsibleContent>
        <div className="space-y-4 border-t border-border p-2 pl-3">
          {items.map((item) =>
            item.kind === "action" ? (
              <ActionRow key={item.id} item={item} />
            ) : item.kind === "report" ? (
              <ReportItem key={item.id} item={item} />
            ) : item.kind === "delegation" ? (
              <DelegationItem key={item.id} item={item} />
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
function BlockItem({
  item,
  onReply,
}: {
  item: ActivityItem
  onReply?: (text: string) => void
}) {
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
                  <Bubble variant="tinted" align="end">
                    <BubbleContent>{text}</BubbleContent>
                  </Bubble>
                )}
              </MessageContent>
            </Message>
          )
        })()
      ) : item.kind === "text" ? (
        <Message className="group/msg">
          <MessageContent>
            <MessageHeader className="gap-3 pl-0">
              <div className="flex gap-1">
                <Icon className="size-3" />
                Kreatos AI
              </div>
              <div className="flex items-center gap-2">
                <TokenBadge tokens={item.tokens} />
                <ModelBadge model={item.model} />
              </div>
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
            <BubbleActions
              text={item.label}
              onReply={onReply ? () => onReply(item.label) : undefined}
            />
          </MessageContent>
        </Message>
      ) : item.kind === "report" ? (
        // Normalmente vive dentro de un TaskBlock; standalone como fallback.
        <div className="ml-5">
          <ReportItem item={item} />
        </div>
      ) : item.kind === "delegation" ? (
        <div className="ml-5">
          <DelegationItem item={item} />
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
            <MessageHeader className="gap-3 pl-0">
              <div className="flex gap-1">
                <Icon className="size-3" />
                Kreatos AI
              </div>
              <ModelBadge model={item.model} />
            </MessageHeader>
            <Bubble
              variant="muted"
              className={item.chosen ? "mb-2" : undefined}
            >
              {item.chosen && (
                // Respuesta elegida como "reacción" colgada de la burbuja.
                <BubbleReactions side="bottom" align="end" className="gap-1">
                  <CheckIcon className="size-3 text-success" />
                  <span className="max-w-48 truncate">{item.chosen}</span>
                </BubbleReactions>
              )}
              <BubbleContent>
                <Streamdown className="text-xs leading-relaxed [&_:not(pre)>code]:mx-0 [&_:not(pre)>code]:rounded-none [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-background [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:text-[11px] [&_:not(pre)>code]:whitespace-nowrap [&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1">
                  {item.label}
                </Streamdown>
                {item.options && item.options.length > 0 && !item.chosen && (
                  // Pendiente: las opciones como contexto (las respondibles
                  // viven sobre el composer del run vivo).
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {item.options.map((option) => (
                      <Badge
                        key={option}
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {option}
                      </Badge>
                    ))}
                  </span>
                )}
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

/**
 * Vista "Entrar al subagente": el transcript del subagente como chat completo
 * (encargo del orquestador → trabajo con tools → reportes), read-only. eve no
 * deja chatear de vuelta con un subagente —es un tool que el root invoca y sus
 * preguntas burbujean al root—, así que NO lleva composer. Los items ya están
 * en memoria (los mismos del TaskBlock); esta vista solo los re-encuadra como
 * conversación y sigue viva mientras el subagente trabaja.
 */
function SubagentFocus({
  name,
  header,
  items,
  onBack,
}: {
  name: string
  header: ActivityItem | null
  items: ActivityItem[]
  onBack: () => void
}) {
  const model = items.find((i) => i.model)?.model ?? header?.model
  const active = header
    ? !header.done
    : items.some((i) => i.kind === "action" && !i.done)
  const failed =
    Boolean(header?.failed) || items.some((i) => i.failed || i.kind === "error")

  // Acciones consecutivas → grupo colapsable (igual que el timeline del root);
  // el resto (encargo, reportes, preguntas, errores) va como burbuja de chat.
  type Group =
    | { key: string; type: "actions"; items: ActivityItem[] }
    | { key: string; type: "single"; item: ActivityItem }
  const groups = items.reduce<Group[]>((acc, item) => {
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
    <div className="absolute inset-0 z-40 flex flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b p-3">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onBack}
          aria-label="Volver al monitor"
        >
          <ArrowLeftIcon />
        </Button>
        <AirTrafficControlIcon
          className={cn(
            "size-4 shrink-0",
            failed ? "text-destructive" : "text-muted-foreground"
          )}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-medium">{name}</h2>
            <ModelBadge model={model} />
          </div>
          <p className="text-xs text-muted-foreground">
            {active
              ? "Trabajando…"
              : failed
                ? "Terminó con errores"
                : "Completado"}
            {header ? ` · delegado ${formatTime(header.at)}` : ""}
          </p>
        </div>
        <div className="ml-auto">
          <CopyTaskButton getText={() => taskTranscript(name, header, items)} />
        </div>
      </div>
      <MessageScrollerProvider
        defaultScrollPosition="end"
        autoScroll
        scrollEdgeThreshold={120}
      >
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="p-3">
            <MessageScrollerContent className="gap-4">
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Delegado; esperando actividad…
                </p>
              ) : (
                groups.map((g) =>
                  g.type === "actions" ? (
                    <MessageScrollerItem key={g.key} messageId={g.key}>
                      {/* Ya estás DENTRO del subagente: las tools se ven
                          directo, sin un tercer colapsable de grupo. Cada fila
                          sigue expandiendo su input/output al hacer click. */}
                      <div className="space-y-1.5 border-l-2 border-border/60 py-0.5 pl-3">
                        {g.items.map((item) => (
                          <ActionRow key={item.id} item={item} />
                        ))}
                      </div>
                    </MessageScrollerItem>
                  ) : (
                    <SubagentMessage key={g.key} name={name} item={g.item} />
                  )
                )
              )}
              {active && (
                <MessageScrollerItem scrollAnchor={false}>
                  <div className="flex items-center gap-2">
                    <AirTrafficControlIcon className="size-3 text-muted-foreground" />
                    <ThinkingIndicator />
                  </div>
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  )
}

/**
 * Un item no-acción del subagente, renderizado como turno de chat dentro de la
 * vista "Entrar": el encargo del orquestador entra como burbuja saliente; los
 * reportes/preguntas/errores del subagente, como burbujas suyas.
 */
function SubagentMessage({ name, item }: { name: string; item: ActivityItem }) {
  if (item.kind === "delegation") {
    // Encargo del orquestador → quien instruye al subagente (burbuja saliente).
    return (
      <MessageScrollerItem messageId={item.id}>
        <Message align="end">
          <MessageContent>
            <MessageHeader className="justify-end">
              Orquestador · {formatTime(item.at)}
            </MessageHeader>
            <Bubble variant="tinted" align="end">
              <BubbleContent>{item.label}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </MessageScrollerItem>
    )
  }
  if (item.kind === "report") {
    return (
      <MessageScrollerItem messageId={item.id}>
        <Message>
          <MessageContent>
            <MessageHeader className="gap-3 pl-0">
              <div className="flex gap-1">
                <AirTrafficControlIcon className="size-3" />
                {name}
              </div>
              <ModelBadge model={item.model} />
            </MessageHeader>
            <Bubble variant="muted">
              <BubbleContent>
                <Streamdown className="text-xs leading-relaxed [&_:not(pre)>code]:mx-0 [&_:not(pre)>code]:rounded-none [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-background [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:text-[11px] [&_h1]:my-1.5 [&_h1]:text-sm [&_h2]:my-1.5 [&_h2]:text-sm [&_h3]:my-1 [&_h3]:text-xs [&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_pre]:my-1.5 [&_pre]:text-[11px] [&_ul]:my-1">
                  {item.label}
                </Streamdown>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </MessageScrollerItem>
    )
  }
  if (item.kind === "question") {
    return (
      <MessageScrollerItem messageId={item.id}>
        <Message>
          <MessageContent>
            <MessageHeader className="gap-3 pl-0">
              <div className="flex gap-1">
                <AirTrafficControlIcon className="size-3" />
                {name}
              </div>
              <ModelBadge model={item.model} />
            </MessageHeader>
            <Bubble variant="muted">
              <BubbleContent>
                <Streamdown className="text-xs leading-relaxed [&_p]:my-1">
                  {item.label}
                </Streamdown>
                {item.options && item.options.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {item.options.map((option) => (
                      <Badge
                        key={option}
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {option}
                      </Badge>
                    ))}
                  </span>
                )}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </MessageScrollerItem>
    )
  }
  if (item.kind === "error") {
    return (
      <MessageScrollerItem messageId={item.id}>
        <Message>
          <MessageContent>
            <Bubble variant="destructive">
              <BubbleContent>{item.label}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </MessageScrollerItem>
    )
  }
  // status u otros: separador discreto.
  return (
    <MessageScrollerItem messageId={item.id}>
      <Marker variant="separator">
        <MarkerContent>{item.label}</MarkerContent>
      </Marker>
    </MessageScrollerItem>
  )
}
