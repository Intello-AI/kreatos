"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

/**
 * Refresca la página cuando design-scout cambia referencias en la BDD
 * (pending → analyzed/failed) vía Supabase Realtime.
 */
export function ReferencesRefresh() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("design-references")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "design_references" },
        () => router.refresh(),
      )
      // Refresh al (re)suscribir: cubre eventos perdidos entre el render del
      // server y la conexión, y reconexiones del socket.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") router.refresh()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
