"use server"

import { revalidatePath } from "next/cache"

import { getAdminClient } from "@/lib/supabase/admin"
import { MANUAL_RATINGS, type ManualRating } from "@/features/leads/types"

/**
 * Calificación manual de un lead (bueno/regular/malo) con nota opcional.
 * `rating = null` limpia la calificación. José la usa para triar leads a mano.
 */
export async function setLeadRating(
  leadId: string,
  rating: ManualRating | null,
  note?: string
): Promise<{ ok?: boolean; formError?: string }> {
  if (rating !== null && !MANUAL_RATINGS.includes(rating)) {
    return { formError: "Calificación inválida." }
  }

  const trimmedNote = note?.trim() || null

  const supabase = getAdminClient()
  const { error } = await supabase
    .from("leads")
    .update({
      manual_rating: rating,
      rating_note: rating === null ? null : trimmedNote,
      rated_at: rating === null ? null : new Date().toISOString(),
    })
    .eq("id", leadId)

  if (error) {
    return { formError: `No se pudo calificar: ${error.message}` }
  }

  revalidatePath(`/dashboard/leads/${leadId}`)
  revalidatePath("/dashboard/leads")
  return { ok: true }
}
