import { defineTool } from "eve/tools"
import { z } from "zod"

import {
  DEFAULT_CITY,
  DETAILS_REQUEST_DELAY_MS,
  MAX_LEADS_PER_RUN,
} from "../lib/constants"
import { fetchPlaceDetails, sleep, textSearchIds } from "../lib/places"

/** Lead calificado: negocio local encontrado en Google Maps sin sitio web. */
export interface QualifiedLead {
  placeId: string
  name: string | null
  category: string
  businessType: string | null
  googleTypes: string[]
  description: string | null
  address: string | null
  phone: string | null
  rating: number | null
  reviewsCount: number | null
  mapsUri: string | null
  city: string
}

export default defineTool({
  description:
    "Busca negocios locales de una categoría en Google Maps (Places API) y devuelve SOLO los que NO tienen sitio web, ya calificados como leads. Los negocios con websiteUri se descartan aquí y nunca se guardan.",
  inputSchema: z.object({
    category: z
      .string()
      .min(1)
      .describe(
        'Categoría de negocio a buscar, en español. Ej: "despachos contables", "constructoras", "empresas de logística".',
      ),
    city: z
      .string()
      .min(1)
      .default(DEFAULT_CITY)
      .describe(`Ciudad donde buscar. Por defecto: ${DEFAULT_CITY}.`),
  }),
  async execute({ category, city }) {
    const textQuery = `${category} en ${city}`
    const placeIds = await textSearchIds(textQuery)

    const leads: QualifiedLead[] = []
    let discardedWithWebsite = 0

    // Secuencial con delay: amable con el rate limit y con el costo.
    for (const placeId of placeIds) {
      if (leads.length >= MAX_LEADS_PER_RUN) break

      const details = await fetchPlaceDetails(placeId)

      // Regla de calificación: sin websiteUri = lead. Con website, descartado.
      if (details.websiteUri && details.websiteUri.trim().length > 0) {
        discardedWithWebsite += 1
      } else {
        leads.push({
          placeId: details.id,
          name: details.displayName?.text ?? null,
          category,
          businessType: details.primaryTypeDisplayName?.text ?? null,
          googleTypes: details.types ?? [],
          description: details.editorialSummary?.text ?? null,
          address: details.formattedAddress ?? null,
          phone: details.nationalPhoneNumber ?? null,
          rating: details.rating ?? null,
          reviewsCount: details.userRatingCount ?? null,
          mapsUri: details.googleMapsUri ?? null,
          city,
        })
      }

      await sleep(DETAILS_REQUEST_DELAY_MS)
    }

    return {
      query: textQuery,
      candidatesFound: placeIds.length,
      discardedWithWebsite,
      qualifiedLeads: leads,
    }
  },
})
