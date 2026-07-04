import type { Tables } from "@repo/supabase"

export const SITE_STATUSES = [
  "brief",
  "generating",
  "preview",
  "approved",
  "published",
  "failed",
] as const

export type SiteStatus = (typeof SITE_STATUSES)[number]

/** Fila de la tabla `sites` (generada), con `status` como unión estricta. */
export type Site = Omit<Tables<"sites">, "status"> & { status: SiteStatus }

export type SiteVersion = Tables<"site_versions">

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  brief: "Brief",
  generating: "Generando",
  preview: "Preview listo",
  approved: "Aprobado",
  published: "Publicado",
  failed: "Falló",
}

export const SITE_PRESETS = [
  { value: "auto", label: "Automático (el agente elige por giro)" },
  { value: "obsidiana", label: "Obsidiana — despachos, dark editorial" },
  { value: "cantera", label: "Cantera — construcción, industrial" },
  { value: "ruta", label: "Ruta — logística, operativo" },
  { value: "bodega", label: "Bodega — distribución, catálogo" },
  { value: "norte", label: "Norte — premium minimal" },
] as const
