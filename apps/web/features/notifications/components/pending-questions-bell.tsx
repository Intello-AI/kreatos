"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { BellIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import {
  listPendingQuestions,
  type PendingQuestion,
} from "@/features/notifications/actions"
import { formatRelative } from "@/lib/dates"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Campana de preguntas HITL pendientes en TODO el pipeline (chat y sitios).
 * Fuente: tabla pending_inputs (la llena el hook del agente). Realtime:
 * INSERT → toast + badge; UPDATE (respondida) → se descuenta sola.
 */
export function PendingQuestionsBell() {
  const [questions, setQuestions] = useState<PendingQuestion[]>([])

  const reload = useCallback(() => {
    void listPendingQuestions().then(setQuestions)
  }, [])

  useEffect(() => {
    reload()
    const supabase = createClient()
    const channel = supabase
      .channel("pending-inputs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pending_inputs" },
        (payload) => {
          reload()
          const prompt = (payload.new as { prompt?: string }).prompt
          toast.info("El agente tiene una pregunta", {
            description: prompt
              ? prompt.slice(0, 140) + (prompt.length > 140 ? "…" : "")
              : undefined,
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pending_inputs" },
        () => reload()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") reload()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [reload])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            questions.length > 0
              ? `${questions.length} preguntas pendientes del agente`
              : "Sin preguntas pendientes"
          }
          className="relative"
        >
          <BellIcon />
          {questions.length > 0 && (
            <Badge className="absolute -top-1 -right-1 size-4 min-w-4 justify-center rounded-full p-0 text-[10px] tabular-nums">
              {questions.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Preguntas del agente</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {questions.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nada pendiente: el agente no está esperando ninguna respuesta.
          </p>
        ) : (
          questions.map((question) => (
            <DropdownMenuItem key={question.requestId} asChild>
              <Link href={question.href} className="flex flex-col items-start gap-0.5">
                <span className="line-clamp-2 text-xs leading-snug">
                  {question.prompt}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {question.sourceLabel} · {formatRelative(question.createdAt)}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
