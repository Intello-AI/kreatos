"use client"

import { useState } from "react"
import Link from "next/link"
import { GlobeIcon } from "@phosphor-icons/react"

import { Skeleton } from "@/components/ui/skeleton"

const MAX_ATTEMPTS = 6
const RETRY_MS = 4000

/**
 * Preview de un sitio EXTERNO. Iframe no sirve (X-Frame-Options); se usa una
 * captura vía mShots (WordPress.com, keyless). La primera vez mShots devuelve
 * un placeholder "generando" de baja resolución: se reintenta con
 * cache-buster hasta recibir la captura real (ancho >= 1000px).
 * Mejora futura: screenshot propio de design-scout a Storage
 * (design_references.screenshot_path ya existe para eso).
 */
export function ReferencePreview({
  url,
  title,
  screenshotUrl,
}: {
  url: string
  title: string
  /** Captura propia (Storage) si existe; manda sobre el servicio externo. */
  screenshotUrl?: string | null
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Si la captura propia no existe (referencias analizadas antes de que el
  // scout subiera card.png), se cae al servicio externo en vez de al globo.
  const [ownFailed, setOwnFailed] = useState(false)

  const own = screenshotUrl && !ownFailed ? screenshotUrl : null
  const src =
    own ??
    `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=1280&h=800${
      attempt > 0 ? `&r=${attempt}` : ""
    }`

  const onSettle = (el: HTMLImageElement | null) => {
    if (!el?.complete) return
    if (el.naturalWidth === 0) {
      if (own) {
        setOwnFailed(true)
      } else {
        setFailed(true)
      }
      return
    }
    // Captura real (pedimos 1280); el gif "generando" de mShots es chico.
    if (own || el.naturalWidth >= 1000) {
      setLoaded(true)
    } else if (attempt < MAX_ATTEMPTS) {
      setTimeout(() => setAttempt((a) => a + 1), RETRY_MS)
    } else {
      // Se rinde: muestra lo que haya (placeholder) en vez de skeleton eterno.
      setLoaded(true)
    }
  }

  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir ${title} en pestaña nueva`}
      className="relative block h-full w-full overflow-hidden bg-background"
    >
      {!failed ? (
        // Captura externa: next/image exigiría permitir el dominio remoto.
        // El ref cubre imágenes que cargaron antes de la hidratación.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${own ? "own" : "ext"}-${attempt}`}
          src={src}
          alt={title}
          loading="lazy"
          ref={onSettle}
          onLoad={(e) => onSettle(e.currentTarget)}
          onError={() => (own ? setOwnFailed(true) : setFailed(true))}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/30">
          <GlobeIcon className="size-6 text-muted-foreground/60" />
        </div>
      )}
      {!loaded && !failed && <Skeleton className="absolute inset-0" />}
    </Link>
  )
}
