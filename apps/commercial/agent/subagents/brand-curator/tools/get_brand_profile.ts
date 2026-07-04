import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

export default defineTool({
  description:
    "Ficha de marca actual del lead + archivos subidos a su inbox (bucket brand-assets), con URLs públicas para analizarlos.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
  }),
  async execute({ leadId }) {
    const supabase = getSupabaseClient()

    const [{ data: lead }, { data: brand }, inbox] = await Promise.all([
      supabase
        .from("leads")
        .select("id, name, category, city, website")
        .eq("id", leadId)
        .maybeSingle(),
      supabase.from("lead_brand").select("*").eq("lead_id", leadId).maybeSingle(),
      supabase.storage.from("brand-assets").list(`${leadId}/inbox`, {
        limit: 50,
        sortBy: { column: "created_at", order: "desc" },
      }),
    ])
    if (!lead) throw new Error(`Lead ${leadId} no existe.`)

    const supabaseUrl = process.env.SUPABASE_URL ?? ""
    const publicUrl = (path: string) =>
      `${supabaseUrl}/storage/v1/object/public/brand-assets/${path}`

    return {
      lead,
      brand: brand ?? null,
      logoUrl: brand?.logo_path ? publicUrl(brand.logo_path) : null,
      inbox: (inbox.data ?? [])
        .filter((f) => f.name !== ".emptyFolderPlaceholder")
        .map((f) => ({
          path: `${leadId}/inbox/${f.name}`,
          url: publicUrl(`${leadId}/inbox/${f.name}`),
          createdAt: f.created_at,
        })),
    }
  },
})
