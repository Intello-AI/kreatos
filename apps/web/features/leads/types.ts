import type { Tables } from "@repo/supabase"

export const LEAD_STATUSES = [
  "new",
  "proposal_ready",
  "contacted",
  "won",
  "lost",
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

/**
 * Fila de la tabla `leads` (generada), con `status` como unión estricta y el
 * site 1:1 embebido (solo id) para linkear "Ver sitio" desde la tabla.
 */
export type Lead = Omit<Tables<"leads">, "status"> & {
  status: LeadStatus
  sites: { id: string; status: string; status_updated_at: string | null } | null
  /** Ficha de marca 1:1 (null si el brand-curator no la ha armado). */
  lead_brand: {
    short_name: string | null
    logo_path: string | null
    colors: string[] | null
    updated_at: string | null
  } | null
}

/** Hito o nota en el timeline de un lead (tabla lead_activity). */
export type LeadActivity = Tables<"lead_activity">

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuevo",
  proposal_ready: "Propuesta lista",
  contacted: "Contactado",
  won: "Ganado",
  lost: "Perdido",
}

/** Calificación manual que José pone a un lead. */
export const MANUAL_RATINGS = ["good", "regular", "bad"] as const

export type ManualRating = (typeof MANUAL_RATINGS)[number]

export const MANUAL_RATING_LABELS: Record<ManualRating, string> = {
  good: "Bueno",
  regular: "Regular",
  bad: "Malo",
}

/**
 * Idioma primario del cliente (columna `leads.language`). Es el locale DEFAULT
 * del sitio generado (locales[0], sin prefijo en "/"): MX = "es"; clientes de
 * US = "en". El resto son idiomas EXTRA que se marcan aparte al generar.
 */
export const LANGUAGES = ["es", "en", "pt", "fr"] as const

export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
}

/** Calidad de la web actual del negocio (la evalúa el pipeline). */
export const WEBSITE_QUALITIES = [
  "none",
  "broken",
  "outdated",
  "weak",
  "decent",
  "unknown",
] as const

export type WebsiteQuality = (typeof WEBSITE_QUALITIES)[number]

export const WEBSITE_QUALITY_LABELS: Record<WebsiteQuality, string> = {
  none: "Sin web",
  broken: "Rota",
  outdated: "Vieja",
  weak: "Floja",
  decent: "Decente",
  unknown: "Desconocida",
}

export function parseManualRating(
  value: string | undefined
): ManualRating | undefined {
  return MANUAL_RATINGS.includes(value as ManualRating)
    ? (value as ManualRating)
    : undefined
}

export function parseWebsiteQuality(
  value: string | undefined
): WebsiteQuality | undefined {
  return WEBSITE_QUALITIES.includes(value as WebsiteQuality)
    ? (value as WebsiteQuality)
    : undefined
}
