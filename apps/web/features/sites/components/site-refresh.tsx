"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Refresca la página cada 10s mientras el sitio se está generando. */
export function SiteRefresh({ active }: { active: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(interval)
  }, [active, router])

  return null
}
