import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ImageIcon,
  MapPinIcon,
  PaletteIcon,
  StarIcon,
} from "@phosphor-icons/react/ssr"

import { getLeadCost } from "@/features/costs/queries"
import { LeadCostPanel } from "@/features/costs/components/lead-cost-panel"
import { getLeadBrand } from "@/features/leads/brand-actions"
import {
  LeadBrandAside,
  LeadBrandProvider,
  LeadBrandTrigger,
} from "@/features/leads/components/lead-brand-panel"
import { LeadStatusSelect } from "@/features/leads/components/lead-status-select"
import { LeadRatingControl } from "@/features/leads/components/lead-rating-control"
import { LeadBrandGenerateButton } from "@/features/leads/components/lead-brand-generate-button"
import { getLeadDetail } from "@/features/leads/queries"
import type { ManualRating } from "@/features/leads/types"
import { GenerateSiteDialog } from "@/features/sites/components/generate-site-dialog"
import { formatDate } from "@/lib/dates"
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

export const metadata: Metadata = {
  title: "Lead — Kreatos",
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

function brandAssetUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand-assets/${path}`
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ lead, error }, brand, cost] = await Promise.all([
    getLeadDetail(id),
    getLeadBrand(id),
    getLeadCost(id),
  ])

  if (error) {
    return (
      <main className="mx-auto w-full max-w-4xl p-3 py-5">
        <p className="text-sm text-destructive">Error: {error}</p>
      </main>
    )
  }
  if (!lead) notFound()

  const runIds = brand?.eve_run_ids ?? []
  const hasBrand =
    brand &&
    (brand.short_name ||
      brand.logo_path ||
      brand.colors.length > 0 ||
      brand.images.length > 0 ||
      brand.voice)

  return (
    <LeadBrandProvider>
      <main className="flex min-h-[calc(100vh-48px)] w-full items-stretch">
        <div className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-4xl space-y-6 p-4 py-6">
            {/* Header estilo detalle: flecha+título clickable, status, acciones */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-full min-w-0 space-y-1 md:w-auto md:flex-1">
                <div className="flex items-center gap-3">
                  <Link
                    href="/dashboard/leads"
                    aria-label="Volver a leads"
                    className="group flex min-w-0 items-center gap-2"
                  >
                    <ArrowLeftIcon
                      weight="bold"
                      className="size-5 shrink-0 text-foreground"
                    />
                    <h1 className="truncate text-xl font-semibold md:text-2xl">
                      {lead.name ?? "Lead"}
                    </h1>
                  </Link>
                  <LeadStatusSelect leadId={lead.id} status={lead.status} />
                  {/* En mobile el trigger del chat vive en la línea del
                      título; en desktop en el grupo de acciones. */}
                  <span className="ml-auto shrink-0 md:hidden">
                    <LeadBrandTrigger label="Abrir o cerrar el chat de marca" />
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {[lead.category, lead.city].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {lead.website && (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={lead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Sitio actual
                      <ArrowSquareOutIcon />
                    </Link>
                  </Button>
                )}
                {lead.sites ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/sites/${lead.sites.id}`}>
                      Ver sitio
                      <ArrowSquareOutIcon />
                    </Link>
                  </Button>
                ) : (
                  <GenerateSiteDialog leadId={lead.id} leadName={lead.name} />
                )}
                <span className="hidden md:inline-flex">
                  <LeadBrandTrigger label="Abrir o cerrar el chat de marca" />
                </span>
              </div>
            </div>

            {/* Datos del negocio */}
            <div className="grid grid-cols-1 divide-y md:grid-cols-3 md:gap-4 md:divide-y-0">
              <MetaRow label="Teléfono">{lead.phone ?? "—"}</MetaRow>
              <MetaRow label="Email">{lead.email ?? "—"}</MetaRow>
              <MetaRow label="Rating">
                {lead.rating !== null ? (
                  <span className="flex items-center gap-1">
                    <StarIcon
                      weight="fill"
                      className="size-3.5 fill-warning text-warning"
                    />
                    {lead.rating} ({lead.reviews_count ?? 0} reseñas)
                  </span>
                ) : (
                  "—"
                )}
              </MetaRow>
              <MetaRow label="Tipo">{lead.business_type ?? "—"}</MetaRow>
              <MetaRow label="Creado">{formatDate(lead.created_at)}</MetaRow>
              <MetaRow label="Dirección">
                {lead.address ? (
                  lead.maps_uri ? (
                    <Link
                      href={lead.maps_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1 underline-offset-2 hover:underline"
                    >
                      <MapPinIcon className="mt-0.5 size-3.5 shrink-0" />
                      <span>{lead.address}</span>
                    </Link>
                  ) : (
                    lead.address
                  )
                ) : (
                  "—"
                )}
              </MetaRow>
              {lead.description && (
                <div className="md:col-span-3">
                  <MetaRow label="Descripción">{lead.description}</MetaRow>
                </div>
              )}
              {lead.notes && (
                <div className="md:col-span-3">
                  <MetaRow label="Notas">
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {lead.notes}
                    </p>
                  </MetaRow>
                </div>
              )}
            </div>

            <Separator />

            {/* Calificación manual */}
            <div className="space-y-3">
              <div className="space-y-0.5">
                <h2 className="text-sm font-medium">Calificación</h2>
                <p className="text-xs text-muted-foreground">
                  Tu valoración a mano de este lead, con una nota opcional.
                </p>
              </div>
              <LeadRatingControl
                leadId={lead.id}
                rating={(lead.manual_rating as ManualRating | null) ?? null}
                note={lead.rating_note}
              />
            </div>

            <Separator />

            {/* Ficha de marca */}
            <div className="space-y-3">
              <div className="space-y-0.5">
                <h2 className="text-sm font-medium">Marca</h2>
                <p className="text-xs text-muted-foreground">
                  Lo que el curador tiene guardado. Se alimenta desde el chat:
                  fotos, logo, la página web del negocio o datos dictados.
                </p>
              </div>

              {!hasBrand ? (
                <Empty className="border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PaletteIcon />
                    </EmptyMedia>
                    <EmptyTitle>Sin ficha de marca</EmptyTitle>
                    <EmptyDescription>
                      {lead.website
                        ? "El curador puede arrancar solo desde el sitio actual del negocio; también puedes pasarle logo o fotos por el chat."
                        : "Abre el chat de marca y pásale el logo, fotos o la página web del negocio — el curador arma la ficha."}
                    </EmptyDescription>
                  </EmptyHeader>
                  <LeadBrandGenerateButton
                    website={lead.website}
                    label={
                      lead.website ? "Generar marca desde su sitio" : "Generar marca"
                    }
                  />
                </Empty>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 divide-y md:grid-cols-3 md:gap-4 md:divide-y-0">
                    <MetaRow label="Nombre corto">
                      {brand.short_name ?? "—"}
                    </MetaRow>
                    <MetaRow label="Tagline">{brand.tagline ?? "—"}</MetaRow>
                    <MetaRow label="Colores">
                      {brand.colors.length > 0 ? (
                        <span className="flex items-center gap-1.5">
                          {brand.colors.map((color) => (
                            <span
                              key={color}
                              title={color}
                              className="size-4 rounded-full border"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </MetaRow>
                    <MetaRow label="Logo">
                      {brand.logo_path ? (
                        <span className="inline-flex h-12 items-center rounded border bg-muted/30 px-3 py-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={brandAssetUrl(brand.logo_path)}
                            alt="Logo"
                            className="max-h-9 w-auto"
                          />
                        </span>
                      ) : (
                        "—"
                      )}
                    </MetaRow>
                    <MetaRow label="Isotipo">
                      {brand.icon_path ? (
                        <span className="inline-flex size-12 items-center justify-center rounded border bg-muted/30 p-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={brandAssetUrl(brand.icon_path)}
                            alt="Isotipo"
                            className="max-h-full w-auto"
                          />
                        </span>
                      ) : (
                        "—"
                      )}
                    </MetaRow>
                    <MetaRow label="Voz">
                      {brand.voice ? (
                        <span>
                          {[
                            brand.voice.tone,
                            brand.voice.register === "usted"
                              ? "de usted"
                              : brand.voice.register === "tu"
                                ? "de tú"
                                : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </MetaRow>
                    {brand.services.length > 0 && (
                      <div className="md:col-span-3">
                        <MetaRow label="Servicios">
                          <span className="flex flex-wrap gap-1.5">
                            {brand.services.map((service) => (
                              <Badge
                                key={service.name}
                                variant="outline"
                                title={service.description}
                              >
                                {service.name}
                              </Badge>
                            ))}
                          </span>
                        </MetaRow>
                      </div>
                    )}
                    {brand.differentiators && (
                      <div className="md:col-span-3">
                        <MetaRow label="Diferenciadores">
                          {brand.differentiators}
                        </MetaRow>
                      </div>
                    )}
                  </div>

                  {brand.images.length > 0 && (
                    <MetaRow label={`Imágenes (${brand.images.length})`}>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {brand.images.map((path) => (
                          <Link
                            key={path}
                            href={brandAssetUrl(path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block aspect-square overflow-hidden rounded border bg-muted/30"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={brandAssetUrl(path)}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          </Link>
                        ))}
                      </div>
                    </MetaRow>
                  )}
                </div>
              )}
              {!hasBrand && runIds.length === 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ImageIcon className="size-3.5" />
                  También puedes arrastrar imágenes directo al chat.
                </p>
              )}
            </div>

            <Separator />

            <LeadCostPanel cost={cost} />
          </div>
        </div>

        <LeadBrandAside leadId={lead.id} initialRunIds={runIds} />
      </main>
    </LeadBrandProvider>
  )
}
