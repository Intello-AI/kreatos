/** Máximo de leads calificados que una corrida puede guardar. */
export const MAX_LEADS_PER_RUN = 20

/** Pausa entre llamadas a Place Details para ser amable con el rate limit. */
export const DETAILS_REQUEST_DELAY_MS = 250

/** Ciudad por defecto para las búsquedas. */
export const DEFAULT_CITY = "Torreón, Coahuila"

/**
 * Barrido nacional: las ~40 zonas metropolitanas más grandes de México. El
 * lead-finder rota entre ellas para cubrir "todo México" sin volver Places API
 * infinita. Cada corrida toma UNA ciudad + UNA categoría (Places es city-scoped).
 */
export const MX_CITIES = [
  "Ciudad de México",
  "Guadalajara, Jalisco",
  "Monterrey, Nuevo León",
  "Puebla, Puebla",
  "Toluca, Estado de México",
  "Tijuana, Baja California",
  "León, Guanajuato",
  "Querétaro, Querétaro",
  "Ciudad Juárez, Chihuahua",
  "Torreón, Coahuila",
  "San Luis Potosí, San Luis Potosí",
  "Mérida, Yucatán",
  "Mexicali, Baja California",
  "Aguascalientes, Aguascalientes",
  "Cuernavaca, Morelos",
  "Saltillo, Coahuila",
  "Hermosillo, Sonora",
  "Culiacán, Sinaloa",
  "Chihuahua, Chihuahua",
  "Morelia, Michoacán",
  "Tampico, Tamaulipas",
  "Veracruz, Veracruz",
  "Villahermosa, Tabasco",
  "Reynosa, Tamaulipas",
  "Cancún, Quintana Roo",
  "Xalapa, Veracruz",
  "Oaxaca, Oaxaca",
  "Celaya, Guanajuato",
  "Irapuato, Guanajuato",
  "Tuxtla Gutiérrez, Chiapas",
  "Durango, Durango",
  "Mazatlán, Sinaloa",
  "Matamoros, Tamaulipas",
  "Nuevo Laredo, Tamaulipas",
  "Ensenada, Baja California",
  "Pachuca, Hidalgo",
  "Tepic, Nayarit",
  "Coatzacoalcos, Veracruz",
  "Colima, Colima",
  "Los Mochis, Sinaloa",
] as const

/** Categorías de empresa corporativa/B2B que el schedule diario recorre por defecto. */
export const DEFAULT_CATEGORIES = [
  "despachos contables",
  "constructoras",
  "empresas de logística y transporte",
  "distribuidores y mayoristas",
] as const

/**
 * Field mask de Place Details (Places API New). Pedir solo estos campos
 * controla el costo por request. `websiteUri` distingue lead de sitio nuevo
 * (null) vs candidato a rediseño (con valor).
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
