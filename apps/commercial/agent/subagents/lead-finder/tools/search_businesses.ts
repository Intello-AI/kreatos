import { defineTool } from "eve/tools"
import { z } from "zod"

import {
  DEFAULT_CITY,
  DETAILS_REQUEST_DELAY_MS,
  MAX_LEADS_PER_RUN,
} from "../lib/constants"
import { fetchPlaceDetails, sleep, textSearchIds } from "../lib/places"

/** Lead calificado: negocio local encontrado en Google Maps, con o sin sitio web. */
export interface QualifiedLead {
  placeId: string
  name: string | null
  category: string
  businessType: string | null
  googleTypes: string[]
  description: string | null
  address: string | null
  phone: string | null
  /** websiteUri de Places; null = sin sitio (sitio nuevo), con valor = candidato a rediseño. */
  website: string | null
  rating: number | null
  reviewsCount: number | null
  mapsUri: string | null
  city: string
}

export default defineTool({
  description:
    "Busca negocios locales de una categoría en Google Maps (Places API) y los devuelve como candidatos a lead, con o sin sitio web. `website` viene lleno cuando el negocio ya tiene sitio (candidato a rediseño) y null cuando no tiene (candidato a sitio nuevo).",
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
    let withWebsite = 0

    // Secuencial con delay: amable con el rate limit y con el costo.
    for (const placeId of placeIds) {
      if (leads.length >= MAX_LEADS_PER_RUN) break

      const details = await fetchPlaceDetails(placeId)
      const website = details.websiteUri?.trim() || null
      if (website) withWebsite += 1

      leads.push({
        placeId: details.id,
        name: details.displayName?.text ?? null,
        category,
        businessType: details.primaryTypeDisplayName?.text ?? null,
        googleTypes: details.types ?? [],
        description: details.editorialSummary?.text ?? null,
        address: details.formattedAddress ?? null,
        phone: details.nationalPhoneNumber ?? null,
        website,
        rating: details.rating ?? null,
        reviewsCount: details.userRatingCount ?? null,
        mapsUri: details.googleMapsUri ?? null,
        city,
      })

      await sleep(DETAILS_REQUEST_DELAY_MS)
    }

    return {
      query: textQuery,
      candidatesFound: placeIds.length,
      withWebsite,
      qualifiedLeads: leads,
    }
  },
})
