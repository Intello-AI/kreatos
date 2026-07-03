import { Suspense } from "react"
import type { Metadata } from "next"

import { LeadsFilters } from "@/features/leads/components/leads-filters"
import { LeadsPagination } from "@/features/leads/components/leads-pagination"
import { LeadsTable } from "@/features/leads/components/leads-table"
import { LeadsTableSkeleton } from "@/features/leads/components/leads-table-skeleton"
import {
  getLeadCities,
  getLeads,
  LEADS_PAGE_SIZE,
  parseLeadStatus,
} from "@/features/leads/queries"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Leads — Kreatos",
}

export const dynamic = "force-dynamic"

type LeadsSearchParams = Promise<{
  q?: string
  status?: string
  city?: string
  page?: string
}>

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: LeadsSearchParams
}) {
  const params = await searchParams
  const q = params.q?.trim() || undefined
  const status = parseLeadStatus(params.status)
  const city = params.city || undefined
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1)

  return (
    <main className="mx-auto w-full max-w-6xl p-3 py-5">
      <div className="mb-7 w-full space-y-1">
        <h1 className="text-xl font-semibold md:text-2xl xl:text-3xl">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Negocios sin sitio web encontrados por el agente lead-finder.
        </p>
      </div>

      <div className="space-y-4">
        <Suspense fallback={<FiltersSkeleton />}>
          <FiltersSection />
        </Suspense>

        <Suspense
          key={`${q ?? ""}|${status ?? ""}|${city ?? ""}|${page}`}
          fallback={<LeadsTableSkeleton />}
        >
          <LeadsSection q={q} status={status} city={city} page={page} />
        </Suspense>
      </div>
    </main>
  )
}

async function FiltersSection() {
  const cities = await getLeadCities()
  return <LeadsFilters cities={cities} />
}

function FiltersSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-8 w-36" />
    </div>
  )
}

async function LeadsSection({
  q,
  status,
  city,
  page,
}: {
  q?: string
  status?: ReturnType<typeof parseLeadStatus>
  city?: string
  page: number
}) {
  const { leads, count, error } = await getLeads({ q, status, city, page })

  if (error) {
    return (
      <p className="text-sm text-destructive">Error leyendo leads: {error}</p>
    )
  }

  const totalPages = Math.max(1, Math.ceil(count / LEADS_PAGE_SIZE))
  const hasFilters = Boolean(q || status || city)

  return (
    <div className="space-y-4">
      <LeadsTable leads={leads} hasFilters={hasFilters} />

      {count > 0 && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {count} {count === 1 ? "lead" : "leads"} · página {page} de{" "}
            {totalPages}
          </p>
          <LeadsPagination
            page={page}
            totalPages={totalPages}
            filters={{ q, status, city }}
          />
        </div>
      )}
    </div>
  )
}
