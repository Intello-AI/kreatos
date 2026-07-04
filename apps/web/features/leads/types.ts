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
  sites: { id: string; status: string } | null
  /** Ficha de marca 1:1 (null si el brand-curator no la ha armado). */
  lead_brand: {
    short_name: string | null
    logo_path: string | null
    colors: string[] | null
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
