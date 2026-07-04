import type { Metadata } from "next"
import Link from "next/link"

import { SiteStatusBadge } from "@/features/sites/components/site-status-badge"
import { getSites } from "@/features/sites/queries"
import { formatDate } from "@/lib/dates"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata: Metadata = {
  title: "Sitios — Kreatos",
}

export const dynamic = "force-dynamic"

export default async function SitesPage() {
  const { sites, error } = await getSites()

  return (
    <main className="mx-auto w-full max-w-6xl p-3 py-5">
      <div className="mb-7 w-full space-y-1">
        <h1 className="text-xl font-semibold md:text-2xl xl:text-3xl">Sitios</h1>
        <p className="text-sm text-muted-foreground">
          Sitios generados por el agente site-builder, uno por lead.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Error leyendo sitios: {error}</p>
      ) : sites.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          Sin sitios todavía. Genera uno desde la tabla de leads.
        </p>
      ) : (
        <div className="w-full overflow-x-auto border">
          <Table>
            <TableHeader className="bg-sidebar">
              <TableRow className="divide-x">
                <TableHead>Negocio</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Versión</TableHead>
                <TableHead>Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/sites/${site.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {site.leads?.name ?? site.slug}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.slug}
                  </TableCell>
                  <TableCell>
                    <SiteStatusBadge status={site.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.current_version ? `v${site.current_version}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(site.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  )
}
