"use client"

import { useEffect, useRef, useState } from "react"

import { Shimmer } from "@/components/ai-elements/shimmer"

import { describeAction } from "./site-activity"

/**
 * Paso vivo de una generación para la LISTA de sitios: consume el stream
 * durable del último run (y el de su subagente delegado) y muestra la última
 * acción en curso con shimmer. Ligero a propósito — nada de historial ni
 * burbujas; para eso está el detalle del sitio.
 */
export function SiteLiveStep({ runId }: { runId: string }) {
  const [label, setLabel] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    const consumed = new Set<string>()

    const consume = async (sessionId: string) => {
      if (consumed.has(sessionId)) return
      consumed.add(sessionId)
      let cursor = 0
      let backoff = 1_000
      for (;;) {
        if (controller.signal.aborted || doneRef.current) return
        try {
          const res = await fetch(
            `/eve/v1/session/${sessionId}/stream${cursor > 0 ? `?startIndex=${cursor}` : ""}`,
            { signal: controller.signal }
          )
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          for (;;) {
            const { done: eof, value } = await reader.read()
            if (eof) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""
            for (const line of lines) {
              if (!line.trim()) continue
              cursor += 1
              try {
                const event = JSON.parse(line) as {
                  type: string
                  data?: Record<string, unknown>
                }
                const d = event.data ?? {}
                if (event.type === "actions.requested") {
                  const actions = (d["actions"] ??
                    []) as Array<Record<string, unknown>>
                  const last = actions[actions.length - 1]
                  if (last) setLabel(describeAction(last).label)
                } else if (event.type === "subagent.called") {
                  const childId = d["childSessionId"] as string | undefined
                  if (childId) void consume(childId)
                } else if (
                  sessionId === runId &&
                  (event.type === "session.completed" ||
                    event.type === "session.failed" ||
                    event.type === "session.waiting")
                ) {
                  // Solo el run raíz decide el fin (el hijo termina antes).
                  doneRef.current = true
                  setDone(true)
                  controller.abort()
                  return
                }
              } catch {
                // línea ilegible: el cursor ya avanzó, seguir
              }
            }
          }
          backoff = 1_000
        } catch {
          if (controller.signal.aborted || doneRef.current) return
          await new Promise((resolve) => setTimeout(resolve, backoff))
          backoff = Math.min(backoff * 2, 15_000)
        }
      }
    }

    void consume(runId)
    return () => controller.abort()
  }, [runId])

  if (done) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="block w-full truncate text-xs text-muted-foreground"
      >
        Terminando…
      </span>
    )
  }
  // block w-full truncate: llena la celda de ancho fijo (w-56) y recorta — así
  // la columna no salta de ancho cuando el label cambia de longitud.
  return (
    <span role="status" aria-live="polite" className="block w-full">
      <Shimmer className="block w-full truncate text-xs">
        {label ?? "Conectando…"}
      </Shimmer>
    </span>
  )
}
