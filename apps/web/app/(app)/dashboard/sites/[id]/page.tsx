import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  BrowserIcon,
  GitBranchIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/ssr"

import { SiteActions } from "@/features/sites/components/site-actions"
import {
  SiteActivityAside,
  SiteActivityProvider,
  SiteActivityTrigger,
} from "@/features/sites/components/site-activity-panel"
import {
  SitePreview,
  SitePreviewSkeleton,
} from "@/features/sites/components/site-preview"
import { SiteRefresh } from "@/features/sites/components/site-refresh"
import { SiteStatusBadge } from "@/features/sites/components/site-status-badge"
import { getSiteDetail } from "@/features/sites/queries"
import { formatDate, formatRelative } from "@/lib/dates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Sitio — Kreatos",
}

export const dynamic = "force-dynamic"

function MetaRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  // Mobile: fila de lista con separador (padding vertical, el divide-y lo
  // pone el contenedor). Desktop: celda de grid compacta sin padding.
  return (
    <div className="space-y-0.5 py-2.5 md:py-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { site, versions, error } = await getSiteDetail(id)

  if (error) {
    return (
      <main className="mx-auto w-full max-w-4xl p-3 py-5">
        <p className="text-sm text-destructive">Error: {error}</p>
      </main>
    )
  }
  if (!site) notFound()

  const currentVersion = versions.find(
    (v) => v.version_n === site.current_version
  )
  const previewUrl = currentVersion?.preview_url ?? null
  // Publicado: el iframe muestra producción (dominio público); antes, la
  // preview de rama. deploy_url manda cuando existe y el status es published.
  const displayUrl =
    site.status === "published" && site.deploy_url
      ? site.deploy_url
      : previewUrl
  const liveUrl = site.deploy_url ?? previewUrl
  const generating = site.status === "brief" || site.status === "generating"
  // La versión publicada (mergeada a main) se muestra arriba como
  // producción; la lista de Versiones solo enseña las que viven en preview.
  const previewVersions =
    site.status === "published"
      ? versions.filter((v) => v.version_n !== site.current_version)
      : versions
  const runIds =
    site.eve_run_ids.length > 0
      ? site.eve_run_ids
      : site.eve_run_id
        ? [site.eve_run_id]
        : []

  return (
    <SiteActivityProvider>
      <main className="flex min-h-[calc(100vh-48px)] w-full items-stretch">
        <div className="min-w-0 flex-1">
          <SiteRefresh siteId={site.id} active={generating} />

          <div className="mx-auto w-full max-w-4xl space-y-6 p-4 py-6">
            {/* Header estilo deployment: título + status + acciones primarias */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-full min-w-0 space-y-1 md:w-auto md:flex-1">
                <div className="flex items-center gap-3">
                  <Link
                    href="/dashboard/sites"
                    aria-label="Volver a sitios"
                    className="group flex min-w-0 items-center gap-2"
                  >
                    <ArrowLeftIcon
                      weight="bold"
                      className="size-5 shrink-0 text-foreground"
                    />
                    <h1 className="truncate text-xl font-semibold md:text-2xl">
                      {site.leads?.name ?? site.slug}
                    </h1>
                  </Link>
                  <SiteStatusBadge status={site.status} />
                  {/* En mobile el trigger del chat vive en la línea del
                      título; en desktop en el grupo de acciones. */}
                  {runIds.length > 0 && (
                    <span className="ml-auto shrink-0 md:hidden">
                      <SiteActivityTrigger />
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {site.slug}
                  {site.leads?.city ? ` · ${site.leads.city}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {liveUrl && (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visitar
                      <ArrowSquareOutIcon />
                    </Link>
                  </Button>
                )}
                {runIds.length > 0 && (
                  <span className="hidden md:inline-flex">
                    <SiteActivityTrigger />
                  </span>
                )}
              </div>
            </div>

            {/* Overview estilo Vercel: preview con su propio borde (16:10
              exacto), metadatos al lado sin card — alturas independientes */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
              <div className="aspect-[1280/800] w-full overflow-hidden border">
                {displayUrl ? (
                  <SitePreview
                    url={displayUrl}
                    title={`Preview de ${site.slug}`}
                  />
                ) : generating ? (
                  <SitePreviewSkeleton />
                ) : (
                  <Empty className="h-full bg-muted/30">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BrowserIcon />
                      </EmptyMedia>
                      <EmptyTitle>Sin preview todavía</EmptyTitle>
                      <EmptyDescription>
                        Genera una versión para ver el sitio aquí.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>

              <div className="grid flex-1 grid-cols-1 content-start divide-y md:grid-cols-2 md:gap-4 md:divide-y-0">
                <MetaRow label="Creado">{formatDate(site.created_at)}</MetaRow>
                <MetaRow label="Estado">
                  <SiteStatusBadge status={site.status} />
                </MetaRow>
                {site.published_at && (
                  <MetaRow label="Publicado">
                    {formatRelative(site.published_at)}
                  </MetaRow>
                )}
                <MetaRow label="Versión">
                  {site.current_version ? (
                    `v${site.current_version}`
                  ) : generating ? (
                    <Skeleton className="h-4 w-10" />
                  ) : (
                    "—"
                  )}
                </MetaRow>
                <MetaRow label="Referencia guía">
                  {(site.brief as { referenceSlug?: string })?.referenceSlug ||
                    "Automática"}
                </MetaRow>
                <div className="md:col-span-2">
                  <MetaRow label="Dominios">
                    <div className="space-y-1">
                      {site.deploy_url && (
                        <Link
                          href={site.deploy_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate underline underline-offset-2"
                        >
                          {site.deploy_url.replace("https://", "")}
                        </Link>
                      )}
                      {previewUrl && (
                        <Link
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-muted-foreground underline underline-offset-2"
                        >
                          {previewUrl.replace("https://", "")}
                        </Link>
                      )}
                      {!previewUrl &&
                        !site.deploy_url &&
                        (generating ? (
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-4 w-64" />
                          </div>
                        ) : (
                          "—"
                        ))}
                    </div>
                  </MetaRow>
                </div>
                <div className="md:col-span-2">
                  <MetaRow label="Repositorio">
                    {!site.repo_url && generating ? (
                      <Skeleton className="h-4 w-56" />
                    ) : site.repo_url ? (
                      <div className="flex flex-col gap-1">
                        <Link
                          href={site.repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 underline-offset-2 hover:underline"
                        >
                          <GithubLogoIcon className="size-4 shrink-0" />
                          <span className="truncate">
                            {site.repo_url.replace("https://github.com/", "")}
                          </span>
                        </Link>
                        {site.current_version && (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <GitBranchIcon className="size-4 shrink-0" />v
                            {site.current_version}
                          </span>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </MetaRow>
                </div>
              </div>
            </div>

            <SiteActions siteId={site.id} status={site.status} />

            <Separator />

            <div className="space-y-3">
              <div className="space-y-0.5">
                <h2 className="text-sm font-medium">Versiones</h2>
                <p className="text-xs text-muted-foreground">
                  Cada versión es una rama del repositorio con su propio
                  preview. La versión publicada vive arriba, en producción.
                </p>
              </div>
              {previewVersions.length === 0 ? (
                <Empty className="border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <GitBranchIcon />
                    </EmptyMedia>
                    <EmptyTitle>
                      {versions.length === 0
                        ? "Aún no hay versiones"
                        : "Sin versiones en preview"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {versions.length === 0
                        ? "El spec v1 aparecerá aquí cuando el agente lo guarde."
                        : "La versión publicada está arriba, en producción."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="divide-y border">
                  {previewVersions.map((version) => {
                    const isCurrent = version.version_n === site.current_version
                    const branchUrl = site.repo_url
                      ? `${site.repo_url}/tree/v${version.version_n}`
                      : null
                    return (
                      <li
                        key={version.id}
                        className="flex items-center justify-between gap-4 p-3 text-sm"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                              v{version.version_n}
                            </span>
                            {branchUrl ? (
                              <Link
                                href={branchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                              >
                                <GitBranchIcon className="size-3.5" />v
                                {version.version_n}
                              </Link>
                            ) : null}
                            {isCurrent && (
                              <Badge variant="outline" className="text-xs">
                                Actual
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatRelative(
                                version.deployed_at ?? version.created_at
                              )}
                            </span>
                          </div>
                          {version.changelog && (
                            <p
                              className="line-clamp-1 text-xs text-muted-foreground"
                              title={version.changelog}
                            >
                              {version.changelog}
                            </p>
                          )}
                        </div>
                        {version.preview_url && (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                          >
                            <Link
                              href={version.preview_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Previsualizar
                              <ArrowSquareOutIcon />
                            </Link>
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {runIds.length > 0 && (
          <SiteActivityAside runIds={runIds} siteId={site.id} />
        )}
      </main>
    </SiteActivityProvider>
  )
}
