import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../lib/supabase"

/**
 * Lead manual desde una URL: el humano encontró el negocio por su cuenta.
 * Crea el lead mínimo (place_id sintético `manual-<host>`) y el flujo
 * continúa delegando el buitre al brand-curator, que rellena contactos,
 * nombre real, categoría y arma la ficha de marca desde el sitio.
 */
export default defineTool({
  description:
    "Crea un lead a partir de la URL de un negocio que el humano encontró ('créale un lead a esta página: <url>'). Inserta el lead mínimo (website + nombre provisional del dominio) y devuelve el leadId — INMEDIATAMENTE después delega a brand-curator con [Contexto: lead <leadId>] pidiéndole el modo buitre sobre esa URL para rellenar el lead (nombre real, email, teléfono, categoría, dirección) y armar la ficha de marca. Idempotente: si ya existe un lead con esa URL, lo devuelve.",
  inputSchema: z.object({
    url: z.string().url().describe("Sitio web del negocio."),
    name: z
      .string()
      .optional()
      .describe("Nombre del negocio si el humano lo dijo (si no, el curator lo descubre)."),
    city: z
      .string()
      .default("Torreón, Coahuila")
      .describe("Ciudad del negocio (default: la de la operación)."),
    category: z.string().optional().describe("Giro, si el humano lo dijo."),
  }),
  async execute({ url, name, city, category }) {
    const supabase = getSupabaseClient()
    const host = new URL(url).host.replace(/^www\./, "")

    // Idempotencia: mismo sitio = mismo lead (por website o place_id manual).
    const placeId = `manual-${host.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`
    const { data: existing } = await supabase
      .from("leads")
      .select("id, name, status")
      .or(`place_id.eq.${placeId},website.eq.${url}`)
      .limit(1)
      .maybeSingle()
    if (existing) {
      return {
        leadId: existing.id,
        name: existing.name,
        status: existing.status,
        alreadyExisted: true,
        hint: "Ya existía un lead para este sitio. Si falta información, delega igual el buitre a brand-curator con este leadId.",
      }
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        place_id: placeId,
        name: name ?? host,
        category: category ?? null,
        city,
        website: url,
        status: "new",
        notes: `Lead manual: el humano lo encontró y pasó la URL (${url}).`,
        fetched_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (error) throw new Error(`No se pudo crear el lead: ${error.message}`)

    await supabase.from("lead_activity").insert({
      lead_id: lead.id,
      type: "lead_created",
      note: `Lead creado manualmente desde ${url} (vía chat).`,
      actor: "humano",
    })

    return {
      leadId: lead.id,
      name: name ?? host,
      alreadyExisted: false,
      hint: `OBLIGATORIO AHORA (mismo turno, sin preguntar ni reportar antes): delega a brand-curator → "[Contexto: lead ${lead.id}] Modo buitre sobre ${url}: extrae TODO (nombre real del negocio, email, teléfono, categoría, dirección → update_lead_info) y arma la ficha de marca (logo, iconos, colores, voz, fotos)". Un lead sin buitre queda sin datos y el pipeline se atora.`,
    }
  },
})
