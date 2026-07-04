"use server"

import { revalidatePath } from "next/cache"

import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadStatus,
} from "@/features/leads/types"
import { getAdminClient } from "@/lib/supabase/admin"

/**
 * Cambio manual de status del lead (p. ej. marcarlo como ganado/perdido
 * tras hablar con el cliente). Deja el hito en lead_activity.
 */
export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus
): Promise<{ ok?: boolean; formError?: string }> {
  if (!LEAD_STATUSES.includes(status)) {
    return { formError: "Status inválido." }
  }
  const supabase = getAdminClient()
  const { error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
  if (error) {
    return { formError: `No se pudo actualizar: ${error.message}` }
  }
  await supabase.from("lead_activity").insert({
    lead_id: leadId,
    type: "status_changed",
    note: `Status cambiado manualmente a "${LEAD_STATUS_LABELS[status]}"`,
    actor: "humano",
  })
  revalidatePath(`/dashboard/leads/${leadId}`)
  revalidatePath("/dashboard/leads")
  revalidatePath("/dashboard")
  return { ok: true }
}
