"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

/**
 * Refresca los datos server-side del detalle cuando el sitio cambia en la BDD
 * (status, versiones, preview_url) vía Supabase Realtime — sin polling.
 *
 * `active` (status transitorio: brief/generating) activa además un polling
 * suave de respaldo: cubre eventos perdidos si el websocket se cae o si la
 * publication de realtime no está habilitada en ese entorno.
 */
export function SiteRefresh({
  siteId,
  active = false,
}: {
  siteId: string
  active?: boolean
}) {
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
      // SUBSCRIBED llega tanto en la conexión inicial como en cada re-join
      // tras una desconexión: refrescar aquí cierra la ventana entre el
      // render del server y la suscripción, y recupera eventos perdidos
      // mientras el socket estuvo caído.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") router.refresh()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [siteId, router])

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(interval)
  }, [active, router])

  return null
}
