import type { Metadata } from "next"
import Link from "next/link"
import { StarIcon, ArrowUpRightIcon } from "@phosphor-icons/react/ssr"

import { ReanalyzeButton } from "@/features/references/components/reanalyze-button"
import { ReferencePreview } from "@/features/references/components/reference-preview"
import { ReferenceScreenshotsDialog } from "@/features/references/components/reference-screenshots-dialog"
import { ReferencesRefresh } from "@/features/references/components/references-refresh"
import { ReferencesComposer } from "@/features/references/components/references-toolbar"
import { getReferences } from "@/features/references/queries"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export const metadata: Metadata = {
  title: "Referencias — Kreatos",
}

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  analyzing: "Analizando…",
  analyzed: "Analizada",
  failed: "Falló",
}

// Tokens de status de globals.css, mismo lenguaje que SiteStatusBadge.
const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "border-warning/30 bg-warning/10 dark:bg-warning/15",
  analyzing: "border-info/30 bg-info/10 dark:bg-info/15",
  analyzed: "border-success/30 bg-success/10 dark:bg-success/15",
  failed: "border-error/30 bg-error/10 dark:bg-error/15",
}

const STATUS_DOT_CLASS: Record<string, string> = {
  pending: "bg-warning",
  analyzing: "bg-info animate-pulse",
  analyzed: "bg-success",
  failed: "bg-error",
}

export default async function ReferencesPage() {
  const { references, error } = await getReferences()
  const pendingCount = references.filter((r) => r.status === "pending").length

  return (
    <main className="flex min-h-[calc(100vh-48px)] w-full flex-col">
      <ReferencesRefresh />
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-3 py-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold md:text-2xl xl:text-3xl">
            Referencias de diseño
          </h1>
          <p className="text-sm text-muted-foreground">
            Sitios que te gustan. design-scout los analiza una vez (secciones,
            componentes, paleta, tipografía) y site-builder los usa al diseñar.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-destructive">Error: {error}</p>
        ) : references.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StarIcon />
              </EmptyMedia>
              <EmptyTitle>Sin referencias todavía</EmptyTitle>
              <EmptyDescription>
                Pega abajo las URLs de sitios que te gustan y analízalas.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {references.map((ref) => {
              const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/design-references`
              const desktopUrl = ref.screenshot_path
                ? `${storageBase}/${ref.screenshot_path}`
                : null
              const mobileUrl = ref.screenshot_mobile_path
                ? `${storageBase}/${ref.screenshot_mobile_path}`
                : null
              return (
              <li key={ref.id} className="group relative flex flex-col border">
                <div className="aspect-[1280/800] w-full overflow-hidden border-b">
                  <ReferencePreview
                    url={ref.url}
                    title={`Preview de ${ref.slug}`}
                    screenshotUrl={
                      ref.screenshot_path
                        ? // card.png = viewport-only: el full-page (miles de px
                          // de alto × 26 cards) crasheaba Safari iOS por memoria.
                          `${storageBase}/${ref.screenshot_path.replace(/desktop\.png$/, "card.png")}`
                        : null
                    }
                  />
                  <ReferenceScreenshotsDialog
                    desktopUrl={desktopUrl}
                    mobileUrl={mobileUrl}
                    title={ref.slug}
                  />
                  <div className="absolute top-2 right-2 bg-background h-fit w-fit flex">
                    <Badge
                      variant="outline"
                      className={cn(
                        "ml-auto gap-1.5 text-xs",
                        STATUS_BADGE_CLASS[ref.status]
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          STATUS_DOT_CLASS[ref.status]
                        )}
                      />
                      {STATUS_LABEL[ref.status] ?? ref.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 text-sm">
                  <Link
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-baseline gap-1 truncate font-medium underline-offset-2 hover:underline"
                  >
                    {ref.url
                      .replace(/^https?:\/\/(www\.)?/, "")
                      .replace(/\/$/, "")}{" "}
                    <ArrowUpRightIcon className="size-3" />
                  </Link>
                  <ReanalyzeButton id={ref.id} />
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Composer estilo chat, pegado abajo */}
      <div className="sticky bottom-0 bg-background">
        <div className="z-10 mx-auto w-full max-w-6xl">
          <ReferencesComposer pendingCount={pendingCount} />
        </div>
      </div>
    </main>
  )
}
