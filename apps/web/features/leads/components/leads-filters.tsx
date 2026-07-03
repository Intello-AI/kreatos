"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/features/leads/types"
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

  function setFilter(key: "status" | "city", value: string) {
    const params = new URLSearchParams(searchParams)
    if (value === ALL) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete("page")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 justify-between">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nombre o categoría…"
        className="max-w-64"
        aria-label="Buscar leads"
      />

      <div className="flex items-center gap-2">
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
