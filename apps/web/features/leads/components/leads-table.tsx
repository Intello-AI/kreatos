import { type Lead } from "@/features/leads/types"
import { GenerateSiteDialog } from "@/features/sites/components/generate-site-dialog"
import { SiteStatusBadge } from "@/features/sites/components/site-status-badge"
import type { SiteStatus } from "@/features/sites/types"
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

/**
 * Celda de marca: logo (Storage público) + hasta 3 colores de la ficha.
 * Sin ficha: guion — el detalle del lead es donde se cura.
 */
function LeadBrandCell({
  brand,
  name,
}: {
  brand: Lead["lead_brand"]
  name: string | null
}) {
  if (!brand || (!brand.logo_path && !(brand.colors?.length ?? 0))) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const logoUrl = brand.logo_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand-assets/${brand.logo_path}`
    : null
  return (
    <span className="flex items-center gap-1.5">
      {logoUrl && (
        // Logo chico desde Storage; next/image exigiría permitir el dominio.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`Logo de ${brand.short_name ?? name ?? "la marca"}`}
          loading="lazy"
          className="size-5 shrink-0 rounded-sm border border-border bg-background object-contain"
        />
      )}
      {(brand.colors ?? []).slice(0, 3).map((color) => (
        <span
          key={color}
          aria-hidden
          className="size-2.5 shrink-0 rounded-full border border-border/60"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
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
            <TableHead>Marca</TableHead>
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
              <TableCell>
                <LeadBrandCell brand={lead.lead_brand} name={lead.name} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(lead.created_at)}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  {lead.sites ? (
                    <>
                      <SiteStatusBadge
                        status={lead.sites.status as SiteStatus}
                        statusUpdatedAt={lead.sites.status_updated_at}
                      />
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/sites/${lead.sites.id}`}>
                          Ver
                          <ArrowUpRightIcon />
                        </Link>
                      </Button>
                    </>
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
