import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr"

import { SiteLiveStep } from "@/features/sites/components/site-live-step"
import { SiteStatusBadge } from "@/features/sites/components/site-status-badge"
import { SitesListRefresh } from "@/features/sites/components/sites-list-refresh"
import { getSites } from "@/features/sites/queries"
import { formatDate } from "@/lib/dates"
import { Skeleton } from "@/components/ui/skeleton"
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

export default function SitesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl p-3 py-5">
      <div className="mb-7 w-full space-y-1">
        <h1 className="text-xl font-semibold md:text-2xl xl:text-3xl">Sitios</h1>
        <p className="text-sm text-muted-foreground">
          Sitios generados por el agente site-builder, uno por lead.
        </p>
      </div>

      <Suspense fallback={<SitesTableSkeleton />}>
        <SitesSection />
      </Suspense>
    </main>
  )
}

async function SitesSection() {
  const { sites, error } = await getSites()
  const anyGenerating = sites.some((site) => site.status === "generating")

  if (error) {
    return (
      <p className="text-sm text-destructive">Error leyendo sitios: {error}</p>
    )
  }
  if (sites.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        Sin sitios todavía. Genera uno desde la tabla de leads.
      </p>
    )
  }

  return (
    <div className="w-full overflow-x-auto border">
      <SitesListRefresh active={anyGenerating} />
      <Table>
        <TableHeader className="bg-sidebar">
          <TableRow className="divide-x">
            <TableHead>Negocio</TableHead>
            <TableHead>Estado</TableHead>
            {/* Ancho fijo: el paso vivo cambia de texto y sin esto la columna
                saltaba de ancho en cada acción. */}
            <TableHead className="w-56">Actividad</TableHead>
            <TableHead>Versión</TableHead>
            <TableHead>Preview</TableHead>
            <TableHead>Creado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((site) => {
            // El paso vivo se lee del ÚLTIMO run de la sesión del sitio.
            const lastRunId = site.eve_run_ids?.at(-1) ?? null
            return (
              <TableRow key={site.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/sites/${site.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {site.leads?.name ?? site.slug}
                  </Link>
                </TableCell>
                <TableCell>
                  <SiteStatusBadge
                    status={site.status}
                    statusUpdatedAt={site.status_updated_at}
                    lastActivityAt={site.lastActivityAt}
                  />
                </TableCell>
                <TableCell className="w-56">
                  {site.status === "generating" && lastRunId ? (
                    <SiteLiveStep runId={lastRunId} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {site.current_version ? `v${site.current_version}` : "—"}
                </TableCell>
                <TableCell>
                  {(() => {
                    const previewUrl = site.site_versions[0]?.preview_url
                    const href = site.deploy_url ?? previewUrl
                    if (!href) {
                      return (
                        <span className="text-xs text-muted-foreground">—</span>
                      )
                    }
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
                      >
                        {site.deploy_url ? "Producción" : "Preview"}
                        <ArrowUpRightIcon className="size-3" />
                      </a>
                    )
                  })()}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(site.created_at)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function SitesTableSkeleton() {
  return (
    <div className="w-full space-y-2 border p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}
