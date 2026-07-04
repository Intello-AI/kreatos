"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

/**
 * Refresca la LISTA de sitios cuando cualquier site cambia en la BDD
 * (status, versión, preview) vía Supabase Realtime, con heartbeat de
 * respaldo mientras haya generaciones activas.
 */
export function SitesListRefresh({ active = false }: { active?: boolean }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("sites-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sites" },
        () => router.refresh(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") router.refresh()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [router])

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => router.refresh(), 15_000)
    return () => clearInterval(interval)
  }, [active, router])

  return null
}
