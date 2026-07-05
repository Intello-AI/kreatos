import { SITE_STATUS_LABELS, type SiteStatus } from "@/features/sites/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const STATUS_BADGE_CLASS: Record<SiteStatus, string> = {
  brief: "",
  generating: "border-info/30 bg-info/10 dark:bg-info/15",
  preview: "border-warning/30 bg-warning/10 dark:bg-warning/15",
  approved: "border-success/30 bg-success/10 dark:bg-success/15",
  published: "border-success/30 bg-success/10 dark:bg-success/15",
  failed: "border-error/30 bg-error/10 dark:bg-error/15",
  cancelled: "border-border bg-muted/60",
}

const STATUS_DOT_CLASS: Record<SiteStatus, string> = {
  brief: "bg-muted-foreground/50",
  generating: "bg-info animate-pulse",
  preview: "bg-warning",
  approved: "bg-success",
  published: "bg-success",
  failed: "bg-error",
  cancelled: "bg-muted-foreground/60",
}

// Un run de generación que muere (crash/timeout) deja el status en
// "generating" para siempre: el agente ya no está vivo para corregirlo. Si
// lleva más de esto sin transicionar, se muestra como "Detenido" en vez de
// seguir pulsando "Generando". Umbral holgado: una generación sana con fan-out
// puede tardar varios minutos; no queremos marcar detenido a un run vivo.
const STALE_GENERATING_MS = 20 * 60 * 1000

export function SiteStatusBadge({
  status,
  statusUpdatedAt,
}: {
  status: SiteStatus
  /** sites.status_updated_at — cuándo entró al status actual. */
  statusUpdatedAt?: string | null
}) {
  const stalled =
    status === "generating" &&
    statusUpdatedAt != null &&
    Date.now() - new Date(statusUpdatedAt).getTime() > STALE_GENERATING_MS

  const label = stalled ? "Detenido" : SITE_STATUS_LABELS[status]
  const badgeClass = stalled
    ? STATUS_BADGE_CLASS.cancelled
    : STATUS_BADGE_CLASS[status]
  const dotClass = stalled ? STATUS_DOT_CLASS.cancelled : STATUS_DOT_CLASS[status]

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", badgeClass)}
      title={
        stalled
          ? "La generación no ha avanzado en más de 20 min: el run probablemente se detuvo. Vuelve a pedir que genere el sitio."
          : undefined
      }
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", dotClass)} />
      {label}
    </Badge>
  )
}
