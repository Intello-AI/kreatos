"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  MANUAL_RATINGS,
  MANUAL_RATING_LABELS,
  WEBSITE_QUALITIES,
  WEBSITE_QUALITY_LABELS,
} from "@/features/leads/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ALL = "all"

export function LeadsFilters({ cities }: { cities: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get("q") ?? "")

  // Debounce del buscador: escribe en la URL 350ms después de la última tecla.
  useEffect(() => {
    const applied = searchParams.get("q") ?? ""
    if (search.trim() === applied) return

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      if (search.trim()) {
        params.set("q", search.trim())
      } else {
        params.delete("q")
      }
      params.delete("page")
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, 350)

    return () => clearTimeout(timeout)
  }, [search, searchParams, pathname, router])

  function setFilter(
    key: "status" | "city" | "quality" | "rating",
    value: string
  ) {
    const params = new URLSearchParams(searchParams)
    if (value === ALL) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete("page")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function toggleFlag(key: "hasBrand" | "hasSite") {
    const params = new URLSearchParams(searchParams)
    if (params.get(key) === "1") {
      params.delete(key)
    } else {
      params.set(key, "1")
    }
    params.delete("page")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const hasBrand = searchParams.get("hasBrand") === "1"
  const hasSite = searchParams.get("hasSite") === "1"

  return (
    <div className="flex flex-wrap items-center gap-2 justify-between">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nombre o categoría…"
        className="max-w-64"
        aria-label="Buscar leads"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={hasBrand ? "secondary" : "outline"}
          size="sm"
          aria-pressed={hasBrand}
          onClick={() => toggleFlag("hasBrand")}
        >
          Con marca
        </Button>
        <Button
          type="button"
          variant={hasSite ? "secondary" : "outline"}
          size="sm"
          aria-pressed={hasSite}
          onClick={() => toggleFlag("hasSite")}
        >
          Con sitio
        </Button>

        <Select
          value={searchParams.get("quality") ?? ALL}
          onValueChange={(value) => setFilter("quality", value)}
        >
          <SelectTrigger aria-label="Filtrar por calidad de web">
            <SelectValue placeholder="Web actual" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las webs</SelectItem>
            {WEBSITE_QUALITIES.map((quality) => (
              <SelectItem key={quality} value={quality}>
                {WEBSITE_QUALITY_LABELS[quality]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("rating") ?? ALL}
          onValueChange={(value) => setFilter("rating", value)}
        >
          <SelectTrigger aria-label="Filtrar por calificación">
            <SelectValue placeholder="Calificación" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las calificaciones</SelectItem>
            {MANUAL_RATINGS.map((rating) => (
              <SelectItem key={rating} value={rating}>
                {MANUAL_RATING_LABELS[rating]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("status") ?? ALL}
          onValueChange={(value) => setFilter("status", value)}
        >
          <SelectTrigger aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {LEAD_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("city") ?? ALL}
          onValueChange={(value) => setFilter("city", value)}
        >
          <SelectTrigger aria-label="Filtrar por ciudad">
            <SelectValue placeholder="Ciudad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las ciudades</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
