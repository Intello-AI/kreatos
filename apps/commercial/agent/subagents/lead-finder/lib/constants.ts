/** Máximo de leads calificados que una corrida puede guardar. */
export const MAX_LEADS_PER_RUN = 20

/** Pausa entre llamadas a Place Details para ser amable con el rate limit. */
export const DETAILS_REQUEST_DELAY_MS = 250

/** Ciudad por defecto para las búsquedas. */
export const DEFAULT_CITY = "Torreón, Coahuila"

/** Categorías de empresa corporativa/B2B que el schedule diario recorre por defecto. */
export const DEFAULT_CATEGORIES = [
  "despachos contables",
  "constructoras",
  "empresas de logística y transporte",
  "distribuidores y mayoristas",
] as const

/**
 * Field mask de Place Details (Places API New). Pedir solo estos campos
 * controla el costo por request. `websiteUri` es el campo que descalifica.
 */
export const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "rating",
  "userRatingCount",
  "websiteUri",
  "types",
  // Contexto del negocio para el agente de propuestas (fase 2). No suben el
  // SKU de la llamada: rating/phone/website ya facturan tier Enterprise.
  "primaryTypeDisplayName",
  "editorialSummary",
  "googleMapsUri",
].join(",")
