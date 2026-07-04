import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import {
  ArrowUpRightIcon,
  BrowserIcon,
  HandshakeIcon,
  RocketLaunchIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/ssr"

import { getDashboardStats } from "@/features/dashboard/queries"
import { ActivityChart } from "@/features/dashboard/components/activity-chart"
import { DashboardSkeleton } from "@/features/dashboard/components/dashboard-skeleton"
import { LeadStatusBadge } from "@/features/leads/components/lead-status-badge"
import { LEAD_STATUSES } from "@/features/leads/types"
import { SiteStatusBadge } from "@/features/sites/components/site-status-badge"
import { formatRelative } from "@/lib/dates"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export const metadata: Metadata = {
  title: "Dashboard — Kreatos",
}

export const dynamic = "force-dynamic"

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: string | number
  hint: string
  icon: React.ReactNode
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          {icon}
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  // Shell estático al instante; los datos streamean con Suspense.
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 py-6">
      <div className="space-y-0.5">
        <h1 className="text-xl font-semibold md:text-2xl">Resumen</h1>
        <p className="text-sm text-muted-foreground">
          El pipeline completo de un vistazo: leads, sitios y ventas.
        </p>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </main>
  )
}

async function DashboardContent() {
  const stats = await getDashboardStats()

  if (stats.error) {
    return <p className="text-sm text-destructive">Error: {stats.error}</p>
  }

  const conversion =
    stats.leads.total > 0
      ? Math.round((stats.won / stats.leads.total) * 100)
      : 0
  const maxCategory = stats.leads.topCategories[0]?.count ?? 1

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Leads"
          value={stats.leads.total}
          hint={`+${stats.leads.newThisWeek} esta semana`}
          icon={<UsersThreeIcon className="size-3.5" />}
        />
        <KpiCard
          label="Sitios generados"
          value={stats.sites.total}
          hint={`${stats.sites.inProgress} en curso · ${stats.sites.preview} en preview`}
          icon={<BrowserIcon className="size-3.5" />}
        />
        <KpiCard
          label="Publicados"
          value={stats.sites.published}
          hint="Sitios en producción"
          icon={<RocketLaunchIcon className="size-3.5" />}
        />
        <KpiCard
          label="Vendidos"
          value={stats.won}
          hint={`${conversion}% de los leads`}
          icon={<HandshakeIcon className="size-3.5" />}
        />
      </div>

      {/* Actividad 30d + pipeline por status */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Actividad</CardTitle>
            <CardDescription>
              Leads capturados y sitios generados en los últimos 30 días.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart data={stats.series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pipeline</CardTitle>
            <CardDescription>Leads por etapa — clic para filtrar.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {LEAD_STATUSES.map((status) => (
                <li key={status}>
                  <Link
                    href={`/dashboard/leads?status=${status}`}
                    className="flex items-center justify-between gap-2 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <LeadStatusBadge status={status} />
                    <span className="text-sm font-medium tabular-nums">
                      {stats.leads.byStatus[status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Sitios recientes + top categorías */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Sitios recientes</CardTitle>
            <CardDescription>Las últimas generaciones y su estado.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentSites.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BrowserIcon />
                  </EmptyMedia>
                  <EmptyTitle>Aún no hay sitios</EmptyTitle>
                  <EmptyDescription>
                    Genera el primero desde la tabla de leads.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="divide-y">
                {stats.recentSites.map((site) => (
                  <li key={site.id}>
                    <Link
                      href={`/dashboard/sites/${site.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {site.leadName ?? site.slug}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatRelative(site.created_at)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <SiteStatusBadge status={site.status} />
                        <ArrowUpRightIcon className="size-3.5 text-muted-foreground" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top categorías</CardTitle>
            <CardDescription>De dónde vienen los leads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.leads.topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos aún.</p>
            ) : (
              stats.leads.topCategories.map((category) => (
                <div key={category.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{category.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {category.count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-chart-1"
                      style={{
                        width: `${Math.round((category.count / maxCategory) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
