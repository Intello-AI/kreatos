"use client"

import Link from "next/link"
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"

interface LeadsPaginationProps {
  page: number
  totalPages: number
  /** Filtros activos que deben sobrevivir al cambiar de página. */
  filters: { q?: string; status?: string; city?: string }
}

function pageHref(
  filters: LeadsPaginationProps["filters"],
  page: number
): string {
  const params = new URLSearchParams()
  if (filters.q) params.set("q", filters.q)
  if (filters.status) params.set("status", filters.status)
  if (filters.city) params.set("city", filters.city)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `?${qs}` : "?"
}

/** Números visibles: primera, última y vecinas de la actual, con elipsis. */
function visiblePages(current: number, total: number): (number | "gap")[] {
  const wanted = new Set([1, total, current - 1, current, current + 1])
  const pages = [...wanted]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b)

  const result: (number | "gap")[] = []
  let previous = 0
  for (const p of pages) {
    if (p - previous > 1) result.push("gap")
    result.push(p)
    previous = p
  }
  return result
}

export function LeadsPagination({
  page,
  totalPages,
  filters,
}: LeadsPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <Pagination className="w-fit mx-0">
      <PaginationContent>
        <PaginationItem>
          <Button
            asChild={page > 1}
            variant="ghost"
            size="default"
            disabled={page <= 1}
            className="pl-1.5!"
          >
            {page > 1 ? (
              <Link
                href={pageHref(filters, page - 1)}
                aria-label="Página anterior"
                scroll={false}
              >
                <CaretLeftIcon data-icon="inline-start" />
                <span className="hidden sm:block">Anterior</span>
              </Link>
            ) : (
              <>
                <CaretLeftIcon data-icon="inline-start" />
                <span className="hidden sm:block">Anterior</span>
              </>
            )}
          </Button>
        </PaginationItem>

        {visiblePages(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <Button
                asChild
                variant={item === page ? "outline" : "ghost"}
                size="icon"
              >
                <Link
                  href={pageHref(filters, item)}
                  aria-current={item === page ? "page" : undefined}
                  scroll={false}
                >
                  {item}
                </Link>
              </Button>
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <Button
            asChild={page < totalPages}
            variant="ghost"
            size="default"
            disabled={page >= totalPages}
            className="pr-1.5!"
          >
            {page < totalPages ? (
              <Link
                href={pageHref(filters, page + 1)}
                aria-label="Página siguiente"
                scroll={false}
              >
                <span className="hidden sm:block">Siguiente</span>
                <CaretRightIcon data-icon="inline-end" />
              </Link>
            ) : (
              <>
                <span className="hidden sm:block">Siguiente</span>
                <CaretRightIcon data-icon="inline-end" />
              </>
            )}
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
