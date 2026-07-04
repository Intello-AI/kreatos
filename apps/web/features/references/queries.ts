import { getAdminClient } from "@/lib/supabase/admin"
import type { Tables } from "@repo/supabase"

export type DesignReference = Tables<"design_references">

export async function getReferences(): Promise<{
  references: DesignReference[]
  error: string | null
}> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("design_references")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) return { references: [], error: error.message }
  return { references: (data ?? []) as DesignReference[], error: null }
}
