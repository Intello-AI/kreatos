"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Viewport virtual del sitio: se renderiza a tamaño desktop y se escala. */
const BASE_WIDTH = 1280
const BASE_HEIGHT = 800

/**
 * Skeleton con la silueta de una página (navbar + hero + contenido), estilo
 * Vercel. Llena el contenedor donde se monte.
 */
export function SitePreviewSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col gap-4 overflow-hidden bg-background p-4",
        className
      )}
      aria-hidden
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
      <div className="flex flex-1 items-center gap-6">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-2 h-7 w-28" />
        </div>
        <Skeleton className="hidden h-3/4 flex-1 sm:block" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    </div>
  )
}

/**
 * Preview tipo captura: el iframe corre a 1280×800 (layout desktop real) y se
 * escala en modo "cover" para LLENAR el contenedor completo — escala por el
 * lado dominante y centra; si la proporción del contenedor no es exactamente
 * 16:10 se recorta lo mínimo (como un thumbnail de Vercel), nunca quedan
 * franjas vacías. Sin interacción (pointer-events off); click = abrir en
 * pestaña nueva. Mientras el iframe carga, skeleton.
 */
export function SitePreview({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  // Se guarda QUÉ url terminó de cargar: si la url cambia (preview →
  // producción al publicar), loaded vuelve a false sin necesidad de effect.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const loaded = loadedUrl === url

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      setBox({ width: rect?.width ?? 0, height: rect?.height ?? 0 })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = Math.max(box.width / BASE_WIDTH, box.height / BASE_HEIGHT)
  const offsetX = (box.width - BASE_WIDTH * scale) / 2
  const offsetY = (box.height - BASE_HEIGHT * scale) / 2

  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir ${title} en pestaña nueva`}
      className="group block h-full w-full"
    >
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-background"
      >
        {scale > 0 && (
          <iframe
            src={url}
            title={title}
            width={BASE_WIDTH}
            height={BASE_HEIGHT}
            onLoad={() => setLoadedUrl(url)}
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
            style={{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            }}
            tabIndex={-1}
            aria-hidden
          />
        )}
        {!loaded && <SitePreviewSkeleton className="absolute inset-0" />}
        <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="border bg-background px-2 py-1 text-xs shadow-sm">
            Abrir sitio ↗
          </span>
        </div>
      </div>
    </Link>
  )
}
