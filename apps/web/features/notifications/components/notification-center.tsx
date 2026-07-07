"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  BellIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  DotOutlineIcon,
  QuestionIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import {
  listNotifications,
  listPendingQuestions,
  markNotificationsRead,
  type AgentNotification,
  type PendingQuestion,
} from "@/features/notifications/actions"
import { formatRelative } from "@/lib/dates"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Centro de notificaciones: unifica las PREGUNTAS HITL pendientes (que hay que
 * responder) con la ACTIVIDAD de tareas del agente (Capa 0: tarea lista / falló
 * / hito). Realtime sobre pending_inputs y agent_notifications. La campana marca
 * la suma de pendientes; abrir el panel marca las notificaciones como leídas.
 */
export function NotificationCenter() {
  const [questions, setQuestions] = useState<PendingQuestion[]>([])
  const [notifications, setNotifications] = useState<AgentNotification[]>([])

  const reloadQuestions = useCallback(() => {
    void listPendingQuestions().then(setQuestions)
  }, [])
  const reloadNotifications = useCallback(() => {
    void listNotifications().then(setNotifications)
  }, [])

  useEffect(() => {
    reloadQuestions()
    reloadNotifications()
    const supabase = createClient()
    const channel = supabase
      .channel("notification-center")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pending_inputs" },
        (payload) => {
          reloadQuestions()
          const prompt = (payload.new as { prompt?: string }).prompt
          toast.info("El agente tiene una pregunta", {
            description: prompt
              ? prompt.slice(0, 140) + (prompt.length > 140 ? "…" : "")
              : undefined,
          })
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pending_inputs" },
        () => reloadQuestions(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_notifications" },
        (payload) => {
          reloadNotifications()
          // Solo avisa el CIERRE de una tarea (no el arranque 'running' ni cada
          // reload). El hito aparece en el feed sin toast (evita ruido).
          const row = payload.new as Partial<AgentNotification> | null
          if (!row || row.level !== "task") return
          if (row.status === "done") toast.success(row.title ?? "Tarea lista")
          else if (row.status === "failed")
            toast.error(`Falló: ${row.title ?? "una tarea"}`)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [reloadQuestions, reloadNotifications])

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => n.readAt === null).length,
    [notifications],
  )
  const pending = questions.length + unreadNotifications

  const onOpenChange = useCallback(
    (open: boolean) => {
      // Al abrir el panel se dan por vistas las notificaciones (las preguntas
      // NO: siguen pendientes hasta responderlas).
      if (open && unreadNotifications > 0) {
        void markNotificationsRead().then(reloadNotifications)
      }
    },
    [unreadNotifications, reloadNotifications],
  )

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            pending > 0
              ? `${pending} notificaciones sin ver`
              : "Sin notificaciones nuevas"
          }
          className="relative"
        >
          <BellIcon />
          {pending > 0 && (
            <Badge className="absolute -top-1 -right-1 size-4 min-w-4 justify-center rounded-full p-0 text-[10px] tabular-nums">
              {pending}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[90vw]">
        {questions.length > 0 && (
          <>
            <DropdownMenuLabel className="flex items-center gap-2">
              <QuestionIcon className="size-3.5 text-warning" weight="fill" />
              Preguntas del agente
            </DropdownMenuLabel>
            <div className="max-h-56 overflow-y-auto">
              {questions.map((q) => (
                <NotifRow
                  key={q.requestId}
                  href={q.href}
                  title={q.prompt}
                  meta={`${q.sourceLabel} · ${formatRelative(q.createdAt)}`}
                  icon={
                    <QuestionIcon
                      className="mt-0.5 size-4 shrink-0 text-warning"
                      weight="fill"
                    />
                  }
                  accent
                />
              ))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuLabel>Actividad</DropdownMenuLabel>
        {notifications.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Sin actividad reciente del agente.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <NotifRow
                key={n.id}
                href={n.href ?? "/dashboard"}
                title={n.title}
                meta={`${statusLabel(n)} · ${formatRelative(n.createdAt)}`}
                icon={<StatusIcon status={n.status} level={n.level} />}
                unread={n.readAt === null}
              />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotifRow({
  href,
  title,
  meta,
  icon,
  unread = false,
  accent = false,
}: {
  href: string
  title: string
  meta: string
  icon: React.ReactNode
  unread?: boolean
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-start gap-2.5 rounded-sm px-2 py-2 outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
        accent && "bg-warning/5",
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-2 text-xs leading-snug">{title}</span>
        <span className="text-[10px] text-muted-foreground">{meta}</span>
      </span>
      {unread && (
        <span
          aria-hidden
          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
        />
      )}
    </Link>
  )
}

function StatusIcon({
  status,
  level,
}: {
  status: AgentNotification["status"]
  level: AgentNotification["level"]
}) {
  const cls = "mt-0.5 size-4 shrink-0"
  if (status === "running")
    return <CircleNotchIcon className={cn(cls, "animate-spin text-info")} />
  if (status === "failed")
    return (
      <WarningCircleIcon className={cn(cls, "text-error")} weight="fill" />
    )
  if (level === "milestone")
    return <DotOutlineIcon className={cn(cls, "text-muted-foreground")} weight="fill" />
  return <CheckCircleIcon className={cn(cls, "text-success")} weight="fill" />
}

function statusLabel(n: AgentNotification): string {
  if (n.status === "running") return "En curso"
  if (n.status === "failed") return "Falló"
  if (n.level === "milestone") return "Hito"
  return "Listo"
}
