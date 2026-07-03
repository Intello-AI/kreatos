import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient, type LeadRow } from "../../../lib/supabase"

const leadInputSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().nullable(),
  category: z.string().nullable(),
  businessType: z.string().nullable(),
  googleTypes: z.array(z.string()),
  description: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  rating: z.number().nullable(),
  reviewsCount: z.number().int().nullable(),
  mapsUri: z.string().nullable(),
  city: z.string().min(1),
})

export default defineTool({
  description:
    "Guarda leads calificados (negocios sin sitio web) en la tabla `leads` de Supabase. Hace upsert por place_id: re-ejecutar la misma búsqueda no crea duplicados, solo refresca los datos cacheados y fetched_at.",
  inputSchema: z.object({
    leads: z
      .array(leadInputSchema)
      .min(1)
      .describe("Leads calificados devueltos por search_businesses."),
  }),
  async execute({ leads }) {
    const supabase = getSupabaseClient()
    const fetchedAt = new Date().toISOString()

    const rows: LeadRow[] = leads.map((lead) => ({
      place_id: lead.placeId,
      name: lead.name,
      category: lead.category,
      business_type: lead.businessType,
      google_types: lead.googleTypes,
      description: lead.description,
      address: lead.address,
      phone: lead.phone,
      rating: lead.rating,
      reviews_count: lead.reviewsCount,
      maps_uri: lead.mapsUri,
      city: lead.city,
      fetched_at: fetchedAt,
    }))

    // Upsert por place_id: inserta nuevos y refresca el cache de los
    // existentes sin tocar `status` ni `created_at` (no van en el payload).
    const { data, error } = await supabase
      .from("leads")
      .upsert(rows, { onConflict: "place_id" })
      .select("place_id")

    if (error) {
      throw new Error(`Upsert en leads falló: ${error.message}`)
    }

    return {
      saved: data?.length ?? 0,
      placeIds: (data ?? []).map((row: { place_id: string }) => row.place_id),
    }
  },
})
