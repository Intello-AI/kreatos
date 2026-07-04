import { LEAD_STATUS_LABELS, type LeadStatus } from "@/features/leads/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const STATUS_BADGE_CLASS: Record<LeadStatus, string> = {
  new: "",
  proposal_ready: "border-warning/30 bg-warning/10 dark:bg-warning/15",
  contacted: "border-info/30 bg-info/10 dark:bg-info/15",
  won: "border-success/30 bg-success/10 dark:bg-success/15",
  lost: "border-error/30 bg-error/10 dark:bg-error/15",
}

const STATUS_DOT_CLASS: Record<LeadStatus, string> = {
  new: "bg-muted-foreground/50",
  proposal_ready: "bg-warning",
  contacted: "bg-info",
  won: "bg-success",
  lost: "bg-error",
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", STATUS_BADGE_CLASS[status])}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", STATUS_DOT_CLASS[status])}
      />
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
