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
// "generating" para siempre: el agente ya no está vivo para corregirlo. Si NO
// hay ACTIVIDAD (steps del agente) en este lapso, se muestra "Detenido" en vez
// de seguir pulsando "Generando". Se mide desde el ÚLTIMO latido real
// (lastActivityAt = max token_usage.created_at), NO desde que entró a
// "generating": un build vivo pero largo sigue emitiendo steps. Umbral con
// margen para esperas de deploy (await_preview_deployment no emite steps).
const STALE_GENERATING_MS = 25 * 60 * 1000

// Helper a nivel módulo (NO en el cuerpo del componente): Date.now() dentro del
// render marca el componente como impuro (regla react-compiler). Aquí es una
// función normal llamada durante el render, que sí está permitido.
function isGenerationStale(
  status: SiteStatus,
  freshness: string | null | undefined,
): boolean {
  if (status !== "generating" || freshness == null) return false
  return Date.now() - new Date(freshness).getTime() > STALE_GENERATING_MS
}

export function SiteStatusBadge({
  status,
  statusUpdatedAt,
  lastActivityAt,
}: {
  status: SiteStatus
  /** sites.status_updated_at — cuándo entró al status actual (fallback). */
  statusUpdatedAt?: string | null
  /** Última actividad real del agente (max token_usage.created_at). */
  lastActivityAt?: string | null
}) {
  // Prefiere la actividad real; cae a status_updated_at si aún no hay steps.
  const stalled = isGenerationStale(status, lastActivityAt ?? statusUpdatedAt)

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
          ? "Sin actividad del agente en más de 25 min: el run probablemente se detuvo. Vuelve a pedir que genere el sitio."
          : undefined
      }
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", dotClass)} />
      {label}
    </Badge>
  )
}
