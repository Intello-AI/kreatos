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

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", STATUS_BADGE_CLASS[status])}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", STATUS_DOT_CLASS[status])}
      />
      {SITE_STATUS_LABELS[status]}
    </Badge>
  )
}
