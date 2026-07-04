import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SiteActions } from "@/features/sites/components/site-actions"
import { SiteActivity } from "@/features/sites/components/site-activity"
import { SiteRefresh } from "@/features/sites/components/site-refresh"
import { SiteStatusBadge } from "@/features/sites/components/site-status-badge"
import { getSiteDetail } from "@/features/sites/queries"

export const metadata: Metadata = {
  title: "Sitio — Kreatos",
}

export const dynamic = "force-dynamic"

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
  const generating = site.status === "brief" || site.status === "generating"

  return (
    <main className="mx-auto grid min-h-[calc(100vh-48px)] w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_0.5fr]">
      <div className="flex min-w-0 flex-col items-start p-3 py-5 gap-6 w-full max-w-5xl mx-auto">
        <SiteRefresh active={generating} />

        <div className="space-y-1 w-full">
          <div className="flex items-center gap-3 w-full">
            <h1 className="text-xl font-semibold md:text-2xl">
              {site.leads?.name ?? site.slug}
            </h1>
            <SiteStatusBadge status={site.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {site.slug}
            {site.leads?.city ? ` · ${site.leads.city}` : ""}
            {site.repo_url ? (
              <>
                {" · "}
                <Link
                  href={site.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  repo
                </Link>
              </>
            ) : null}
            {site.deploy_url ? (
              <>
                {" · "}
                <Link
                  href={site.deploy_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  producción
                </Link>
              </>
            ) : null}
          </p>
        </div>

        {generating && (
          <p className="text-sm text-muted-foreground">
            El agente está trabajando; esta página se actualiza sola cada 10s.
          </p>
        )}

        {previewUrl && (
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Preview v{site.current_version}
              </h2>
              <Link
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline underline-offset-2"
              >
                Abrir en pestaña nueva
              </Link>
            </div>
            <iframe
              src={previewUrl}
              title={`Preview de ${site.slug}`}
              className="aspect-video w-full border"
            />
          </div>
        )}

        <div className="w-full">
          <SiteActions siteId={site.id} status={site.status} />
        </div>

        <div className="w-full space-y-3">
          <h2 className="text-sm font-medium">Historial de versiones</h2>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay versiones; el spec v1 aparecerá aquí.
            </p>
          ) : (
            <ul className="space-y-2">
              {versions.map((version) => (
                <li key={version.id} className="border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">v{version.version_n}</span>
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
                      {version.preview_url}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {/* Columna sticky: altura fija a viewport (menos header de 48px), scroll interno propio. */}
      <aside className="min-w-0 overflow-hidden border-t md:border-t-0 md:border-l h-[60vh] md:sticky md:top-12 md:h-[calc(100vh-48px)]">
        {site.eve_run_id ? (
          // key: al cambiar el run (nueva sesión), el panel se remonta con estado limpio.
          <SiteActivity
            key={site.eve_run_id}
            runId={site.eve_run_id}
            siteId={site.id}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            Sin sesión de agente todavía.
          </p>
        )}
      </aside>
    </main>
  )
}
