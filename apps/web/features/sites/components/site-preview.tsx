"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

/** Viewport virtual del sitio: se renderiza a tamaño desktop y se escala. */
const BASE_WIDTH = 1280
const BASE_HEIGHT = 800

/**
 * Preview tipo captura de pantalla: el iframe corre a 1280px (layout desktop
 * real) y se escala al ancho del contenedor. Sin interacción (pointer-events
 * off); click = abrir en pestaña nueva.
 */
export function SitePreview({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setScale(width / BASE_WIDTH)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir ${title} en pestaña nueva`}
      className="group block"
    >
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden bg-background"
        style={{ height: scale > 0 ? BASE_HEIGHT * scale : undefined }}
      >
        {scale > 0 && (
          <iframe
            src={url}
            title={title}
            width={BASE_WIDTH}
            height={BASE_HEIGHT}
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
            style={{ transform: `scale(${scale})` }}
            tabIndex={-1}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="border bg-background px-2 py-1 text-xs shadow-sm">
            Abrir sitio ↗
          </span>
        </div>
      </div>
    </Link>
  )
}
