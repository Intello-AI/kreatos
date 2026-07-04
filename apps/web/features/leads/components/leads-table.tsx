import { type Lead } from "@/features/leads/types"
import { GenerateSiteDialog } from "@/features/sites/components/generate-site-dialog"
import { LeadStatusBadge } from "@/features/leads/components/lead-status-badge"
import { formatDate } from "@/lib/dates"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import Link from "next/link"
import { ArrowUpRightIcon, StarIcon } from "@phosphor-icons/react/ssr"
import { Button } from "@/components/ui/button"

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
              <TableCell className="font-medium">
                <Link
                  href={`/dashboard/leads/${lead.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {lead.name ?? "—"}
                </Link>
              </TableCell>
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
                  {lead.sites ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/sites/${lead.sites.id}`}>
                        Ver sitio
                        <ArrowUpRightIcon />
                      </Link>
                    </Button>
                  ) : (
                    <GenerateSiteDialog leadId={lead.id} leadName={lead.name} />
                  )}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
