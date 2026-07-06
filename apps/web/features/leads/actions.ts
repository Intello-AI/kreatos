"use server"

import { revalidatePath } from "next/cache"

import {
  LANGUAGE_LABELS,
  LANGUAGES,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type Language,
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

/**
 * Idioma primario del cliente. Es el locale DEFAULT del sitio que se genere
 * (locales[0], en "/" sin prefijo): el dialog "Generar sitio" lo preselecciona
 * desde aquí. MX = "es"; clientes de US = "en".
 */
export async function updateLeadLanguage(
  leadId: string,
  language: Language
): Promise<{ ok?: boolean; formError?: string }> {
  if (!LANGUAGES.includes(language)) {
    return { formError: "Idioma inválido." }
  }
  const supabase = getAdminClient()
  const { error } = await supabase
    .from("leads")
    .update({ language })
    .eq("id", leadId)
  if (error) {
    return { formError: `No se pudo actualizar el idioma: ${error.message}` }
  }
  await supabase.from("lead_activity").insert({
    lead_id: leadId,
    type: "status_changed",
    note: `Idioma del cliente cambiado a "${LANGUAGE_LABELS[language]}"`,
    actor: "humano",
  })
  revalidatePath(`/dashboard/leads/${leadId}`)
  revalidatePath("/dashboard/leads")
  return { ok: true }
}
