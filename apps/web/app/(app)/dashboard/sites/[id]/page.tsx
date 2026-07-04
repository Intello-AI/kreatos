import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowSquareOutIcon,
  GitBranchIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/ssr"

import { SiteActions } from "@/features/sites/components/site-actions"
import { SiteActivityPanel } from "@/features/sites/components/site-activity-panel"
import { SitePreview } from "@/features/sites/components/site-preview"
import { SiteRefresh } from "@/features/sites/components/site-refresh"
import { SiteStatusBadge } from "@/features/sites/components/site-status-badge"
import { getSiteDetail } from "@/features/sites/queries"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

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
  return (
    <div className="space-y-0.5">
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
  const liveUrl = site.deploy_url ?? previewUrl
  const generating = site.status === "brief" || site.status === "generating"
  const runIds =
    site.eve_run_ids.length > 0
      ? site.eve_run_ids
      : site.eve_run_id
        ? [site.eve_run_id]
        : []

  return (
    <main className="flex min-h-[calc(100vh-48px)] w-full items-stretch">
      <div className="min-w-0 flex-1">
        <SiteRefresh siteId={site.id} />

        <div className="mx-auto w-full max-w-4xl space-y-6 p-4 py-6">
          {/* Header estilo deployment: título + status + acciones primarias */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="truncate text-xl font-semibold md:text-2xl">
                  {site.leads?.name ?? site.slug}
                </h1>
                <SiteStatusBadge status={site.status} />
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
            </div>
          </div>

          {/* Card overview: preview a la izquierda, metadatos a la derecha */}
          <div className="grid grid-cols-1 border md:grid-cols-2">
            <div className="bg-muted/30 md:border-r">
              {previewUrl ? (
                <SitePreview
                  url={previewUrl}
                  title={`Preview de ${site.slug}`}
                />
              ) : (
                <div className="flex h-full min-h-72 w-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    {generating
                      ? "Generando preview…"
                      : "Sin preview todavía."}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 content-start gap-4 p-4">
              <MetaRow label="Creado">
                {new Date(site.created_at).toLocaleDateString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </MetaRow>
              <MetaRow label="Estado">
                <SiteStatusBadge status={site.status} />
              </MetaRow>
              <MetaRow label="Versión">
                {site.current_version ? `v${site.current_version}` : "—"}
              </MetaRow>
              <MetaRow label="Preset">
                {(site.brief as { preset?: string })?.preset ?? "auto"}
              </MetaRow>
              <div className="col-span-2">
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
                    {!previewUrl && !site.deploy_url && "—"}
                  </div>
                </MetaRow>
              </div>
              <div className="col-span-2">
                <MetaRow label="Repositorio">
                  {site.repo_url ? (
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
            <h2 className="text-sm font-medium">Historial de versiones</h2>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no hay versiones; el spec v1 aparecerá aquí.
              </p>
            ) : (
              <ul className="divide-y border">
                {versions.map((version) => (
                  <li key={version.id} className="p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium">
                        <GitBranchIcon className="size-3.5" />v
                        {version.version_n}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(version.created_at).toLocaleString("es-MX")}
                      </span>
                    </div>
                    {version.changelog && (
                      <p className="mt-1 text-muted-foreground">
                        {version.changelog}
                      </p>
                    )}
                    {version.preview_url && (
                      <Link
                        href={version.preview_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs underline underline-offset-2"
                      >
                        {version.preview_url.replace("https://", "")}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <SiteActivityPanel runIds={runIds} siteId={site.id} />
    </main>
  )
}
