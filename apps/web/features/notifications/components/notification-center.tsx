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
import { useIsMobile } from "@/hooks/use-mobile"
import { formatRelative } from "@/lib/dates"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

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
          // El sonido lo dispara el observer global de toasts (SoundProvider),
          // uniforme para TODOS los toasts; aquí solo el toast.
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

  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      // Al abrir el panel se dan por vistas las notificaciones (las preguntas
      // NO: siguen pendientes hasta responderlas).
      if (next && unreadNotifications > 0) {
        void markNotificationsRead().then(reloadNotifications)
      }
    },
    [unreadNotifications, reloadNotifications],
  )

  const close = useCallback(() => setOpen(false), [])

  const bell = (
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
  )

  // Contenido compartido entre el dropdown (desktop) y el sheet (mobile).
  // `menu` = envolver las filas en DropdownMenuItem (roving focus del menú);
  // en el sheet son links planos que cierran al navegar.
  const sections = (menu: boolean) => (
    <>
      {questions.length > 0 && (
        <>
          <PanelLabel className="flex items-center gap-2">
            <QuestionIcon className="size-3.5 text-warning!" weight="fill" />
            Preguntas del agente
          </PanelLabel>
          <div className={menu ? "max-h-56 overflow-y-auto" : undefined}>
            {questions.map((q) => (
              <NotifRow
                key={q.requestId}
                href={q.href}
                title={q.prompt}
                meta={`${q.sourceLabel} · ${formatRelative(q.createdAt)}`}
                icon={
                  <QuestionIcon
                    className="mt-0.5 size-4 shrink-0 text-warning!"
                    weight="fill"
                  />
                }
                accent
                menu={menu}
                onNavigate={close}
              />
            ))}
          </div>
          <PanelSeparator />
        </>
      )}

      <PanelLabel>Actividad</PanelLabel>
      {notifications.length === 0 ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          Sin actividad reciente del agente.
        </p>
      ) : (
        <div className={menu ? "max-h-80 overflow-y-auto" : undefined}>
          {notifications.map((n) => (
            <NotifRow
              key={n.id}
              href={n.href ?? "/dashboard"}
              title={n.title}
              meta={`${statusLabel(n)} · ${formatRelative(n.createdAt)}`}
              icon={<StatusIcon status={n.status} level={n.level} />}
              unread={n.readAt === null}
              menu={menu}
              onNavigate={close}
            />
          ))}
        </div>
      )}
    </>
  )

  // Mobile: sheet que entra desde la derecha (más cómodo que un dropdown
  // pegado a la campana). Desktop: dropdown anclado al trigger.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{bell}</SheetTrigger>
        <SheetContent
          side="right"
          className="w-[88vw] max-w-sm gap-0 p-0"
        >
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm">Actividad</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-1">{sections(false)}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>{bell}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[90vw]">
        {sections(true)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Etiqueta de sección; sirve igual en el dropdown y en el sheet. */
function PanelLabel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  )
}

function PanelSeparator() {
  return <div aria-hidden className="my-1 h-px bg-border" />
}

function NotifRow({
  href,
  title,
  meta,
  icon,
  unread = false,
  accent = false,
  menu = true,
  onNavigate,
}: {
  href: string
  title: string
  meta: string
  icon: React.ReactNode
  unread?: boolean
  accent?: boolean
  /** true = fila del dropdown (menuitem); false = link plano del sheet. */
  menu?: boolean
  onNavigate?: () => void
}) {
  // rounded-none: el hover/focus llena la fila cuadrado (sin caja redondeada).
  const className = cn(
    "flex items-start gap-2.5 rounded-none px-2 py-2",
    !menu && "hover:bg-accent",
    accent && "bg-warning/5 hover:bg-warning/10 focus:bg-warning/10",
  )
  const inner = (
    <>
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
    </>
  )
  // Sheet: link plano (cierra el sheet al navegar). Dropdown: asChild → la fila
  // ES el menuitem (role, roving focus, arrow-nav, cierra al seleccionar).
  if (!menu) {
    return (
      <Link href={href} onClick={onNavigate} className={className}>
        {inner}
      </Link>
    )
  }
  return (
    <DropdownMenuItem asChild>
      <Link href={href} className={className}>
        {inner}
      </Link>
    </DropdownMenuItem>
  )
}

function StatusIcon({
  status,
  level,
}: {
  status: AgentNotification["status"]
  level: AgentNotification["level"]
}) {
  // El color va con `!` (important): el dropdown recolorea TODOS sus
  // descendientes en focus (`focus:**:text-accent-foreground`) y sin el
  // important el ícono perdería su color semántico al resaltar la fila.
  const cls = "mt-0.5 size-4 shrink-0"
  if (status === "running")
    return <CircleNotchIcon className={cn(cls, "animate-spin text-info!")} />
  if (status === "failed")
    return (
      <WarningCircleIcon className={cn(cls, "text-error!")} weight="fill" />
    )
  if (level === "milestone")
    return (
      <DotOutlineIcon
        className={cn(cls, "text-muted-foreground!")}
        weight="fill"
      />
    )
  return <CheckCircleIcon className={cn(cls, "text-success!")} weight="fill" />
}

function statusLabel(n: AgentNotification): string {
  if (n.status === "running") return "En curso"
  if (n.status === "failed") return "Falló"
  if (n.level === "milestone") return "Hito"
  return "Listo"
}
