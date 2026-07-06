"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

/**
 * Refresca la ficha server-side del lead cuando algo cambia en la BDD, sin
 * recargar la página: mientras el brand-curator corre async y escribe en
 * `lead_brand` (logo, paleta, servicios, voz), la columna izquierda se
 * actualiza sola vía Supabase Realtime.
 *
 * `lead_brand` está en la publication de realtime → eventos instantáneos.
 * El costo (token_usage, vía vistas) y el status/rating (leads) no están en la
 * publication: los cubre el heartbeat suave + el refresh al recuperar foco.
 */
export function LeadDetailRefresh({ leadId }: { leadId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`lead-detail-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_brand",
          filter: `lead_id=eq.${leadId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `id=eq.${leadId}`,
        },
        () => router.refresh(),
      )
      // SUBSCRIBED llega en la conexión inicial y en cada re-join tras un corte:
      // refrescar aquí cierra la ventana entre el render del server y la
      // suscripción, y recupera eventos perdidos mientras el socket estuvo caído.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") router.refresh()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [leadId, router])

  // Heartbeat de respaldo: el costo (token_usage) no está en la publication de
  // realtime, así que sin esto la tabla de costo queda stale mientras un agente
  // quema tokens. Barato: un re-render server de la única página abierta.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, 20_000)
    return () => clearInterval(interval)
  }, [router])

  // Al volver a la pestaña: refresh inmediato (mientras estuvo oculta pudo
  // perderse cualquier cantidad de eventos).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [router])

  return null
}
