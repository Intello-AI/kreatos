"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

/**
 * Refresca los datos server-side del detalle cuando el sitio cambia en la BDD
 * (status, versiones, preview_url) vía Supabase Realtime — sin polling.
 */
export function SiteRefresh({ siteId }: { siteId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`site-${siteId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sites",
          filter: `id=eq.${siteId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "site_versions",
          filter: `site_id=eq.${siteId}`,
        },
        () => router.refresh(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [siteId, router])

  return null
}
