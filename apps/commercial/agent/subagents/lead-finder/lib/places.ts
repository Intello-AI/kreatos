import { PLACE_DETAILS_FIELD_MASK } from "./constants"

const PLACES_BASE_URL = "https://places.googleapis.com/v1"

/** Detalle de un lugar según Places API (New), acotado a nuestro field mask. */
export interface PlaceDetails {
  id: string
  displayName?: { text?: string; languageCode?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  rating?: number
  userRatingCount?: number
  websiteUri?: string
  types?: string[]
  primaryTypeDisplayName?: { text?: string; languageCode?: string }
  editorialSummary?: { text?: string; languageCode?: string }
  googleMapsUri?: string
}

interface TextSearchResponse {
  places?: Array<{ id?: string }>
}

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    throw new Error(
      "Falta GOOGLE_PLACES_API_KEY en el entorno. Agrégala a apps/commercial/.env.local (ver .env.example).",
    )
  }
  return key
}

/**
 * fetch con retry acotado para fallos TRANSITORIOS (429 rate-limit, 5xx). Un
 * rate-limit a media búsqueda NO debe descartar todo el progreso: se reintenta
 * con backoff (respetando Retry-After) hasta `maxRetries`. Los 4xx permanentes
 * (401/403/404) lanzan de inmediato — reintentarlos no cambia nada.
 */
async function fetchWithRetry(
  input: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response
    try {
      res = await fetch(input, { ...init, signal: AbortSignal.timeout(15_000) })
    } catch (err) {
      // Error de red/timeout: transitorio, reintenta.
      lastErr = err
      if (attempt === maxRetries) throw err
      await sleep(backoffMs(attempt))
      continue
    }
    if (res.ok) return res
    const transient = res.status === 429 || res.status >= 500
    if (!transient || attempt === maxRetries) return res
    const retryAfter = Number(res.headers.get("retry-after"))
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : backoffMs(attempt),
    )
  }
  // Inalcanzable, pero satisface el tipo.
  throw lastErr ?? new Error("fetchWithRetry agotó reintentos.")
}

/** Backoff exponencial con jitter: ~0.5s, 1s, 2s... */
function backoffMs(attempt: number): number {
  return Math.round((2 ** attempt * 500) * (0.75 + Math.random() * 0.5))
}

/**
 * Text Search (New): devuelve solo los place ids que matchean la búsqueda.
 * Field mask mínimo (`places.id`) para mantener el costo bajo; los detalles
 * se piden después uno por uno con su propio field mask.
 */
export async function textSearchIds(textQuery: string): Promise<string[]> {
  const res = await fetchWithRetry(`${PLACES_BASE_URL}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({
      textQuery,
      regionCode: "MX",
      languageCode: "es",
      pageSize: 20,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Places Text Search falló (${res.status}): ${body}`)
  }

  const data = (await res.json()) as TextSearchResponse
  return (data.places ?? [])
    .map((place) => place.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
}

/**
 * Place Details (New) por place_id, con field mask acotado.
 *
 * También sirve como helper de refresco: por ToS de Google solo `place_id`
 * puede almacenarse indefinidamente; el resto de campos guardados en `leads`
 * es cache con `fetched_at` y se re-hidrata volviendo a llamar esta función.
 */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const res = await fetchWithRetry(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Places Details falló para ${placeId} (${res.status}): ${body}`)
  }

  return (await res.json()) as PlaceDetails
}

/** Pausa utilitaria para espaciar requests secuenciales. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
