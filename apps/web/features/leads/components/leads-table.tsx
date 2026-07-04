import {
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadStatus,
} from "@/features/leads/types"
import { GenerateSiteDialog } from "@/features/sites/components/generate-site-dialog"
import { LeadBrandSheet } from "@/features/leads/components/lead-brand-sheet"
import { formatDate } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StarIcon } from "@phosphor-icons/react/ssr"

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

function LeadStatusBadge({ status }: { status: LeadStatus }) {
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

export function LeadsTable({
  leads,
  hasFilters,
}: {
  leads: Lead[]
  hasFilters: boolean
}) {
  if (leads.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        {hasFilters
          ? "Sin leads que coincidan con los filtros."
          : "Sin leads todavía. Corre el agente lead-finder para llenar esta tabla."}
      </p>
    )
  }

  return (
    <div className="w-full overflow-x-auto border">
      <Table>
        <TableHeader className="bg-sidebar">
          <TableRow className="divide-x">
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Ciudad</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creado</TableHead>
            <TableHead>Sitio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {lead.category ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {lead.city}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {lead.phone ?? "—"}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1">
                  <StarIcon weight="fill" className="size-3 fill-warning text-warning" />
                  {lead.rating !== null
                    ? `${lead.rating} (${lead.reviews_count ?? 0})`
                    : "—"}
                </span>
              </TableCell>
              <TableCell>
                <LeadStatusBadge status={lead.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(lead.created_at)}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1">
                  <LeadBrandSheet leadId={lead.id} leadName={lead.name} />
                  <GenerateSiteDialog leadId={lead.id} leadName={lead.name} />
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
