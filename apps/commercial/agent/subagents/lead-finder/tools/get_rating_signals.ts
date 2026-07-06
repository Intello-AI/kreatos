import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

type Rating = "good" | "regular" | "bad"

interface Bucket {
  good: number
  regular: number
  bad: number
}

interface SignalEntry {
  key: string
  good: number
  regular: number
  bad: number
  goodRate: number
}

function emptyBucket(): Bucket {
  return { good: 0, regular: 0, bad: 0 }
}

function tally(
  map: Map<string, Bucket>,
  key: string | null,
  rating: Rating,
): void {
  if (!key) return
  const bucket = map.get(key) ?? emptyBucket()
  bucket[rating] += 1
  map.set(key, bucket)
}

function summarize(map: Map<string, Bucket>, cap = 12): SignalEntry[] {
  return [...map.entries()]
    .map(([key, b]) => {
      const total = b.good + b.regular + b.bad
      return {
        key,
        good: b.good,
        regular: b.regular,
        bad: b.bad,
        goodRate: total > 0 ? Number((b.good / total).toFixed(2)) : 0,
      }
    })
    .sort((a, b) => b.good + b.regular + b.bad - (a.good + a.regular + a.bad))
    .slice(0, cap)
}

export default defineTool({
  description:
    "Devuelve el agregado de las calificaciones manuales (good/regular/bad) que el humano dio a los leads en el dashboard. Sirve para sesgar qué categorías, ciudades, tipos de negocio y calidad de web perseguir: perfiles con alto goodRate valen la pena; los mayormente 'bad' conviene evitarlos.",
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .positive()
      .max(5000)
      .default(2000)
      .describe("Máximo de leads calificados a considerar."),
  }),
  async execute({ limit }) {
    const supabase = getSupabaseClient()

    const { data, error } = await supabase
      .from("leads")
      .select("category, city, business_type, website_quality, manual_rating")
      .not("manual_rating", "is", null)
      .limit(limit)

    if (error) {
      throw new Error(`Consulta de calificaciones falló: ${error.message}`)
    }

    const rows = data ?? []
    if (rows.length === 0) {
      return {
        totalRated: 0,
        hint: "Aún no hay leads calificados manualmente; usa los criterios normales.",
      }
    }

    const byCategory = new Map<string, Bucket>()
    const byCity = new Map<string, Bucket>()
    const byWebsiteQuality = new Map<string, Bucket>()
    const byBusinessType = new Map<string, Bucket>()

    let totalRated = 0
    for (const row of rows) {
      const rating = row.manual_rating
      if (rating !== "good" && rating !== "regular" && rating !== "bad") {
        continue
      }
      totalRated += 1
      tally(byCategory, row.category, rating)
      tally(byCity, row.city, rating)
      tally(byWebsiteQuality, row.website_quality, rating)
      tally(byBusinessType, row.business_type, rating)
    }

    return {
      totalRated,
      hint: "goodRate = good/(good+regular+bad). Prioriza perfiles con goodRate alto y evita los mayormente 'bad'. Es un sesgo suave, no un filtro duro: las reglas de perfil corporativo siguen mandando.",
      byCategory: summarize(byCategory),
      byCity: summarize(byCity),
      byWebsiteQuality: summarize(byWebsiteQuality),
      byBusinessType: summarize(byBusinessType),
    }
  },
})
