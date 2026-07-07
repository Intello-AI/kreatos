import { Resend } from "resend"

import { getSupabaseClient } from "./supabase"
import { TaskCompleteEmail } from "./emails/task-complete-email"

// Base del dashboard para los links del correo (mismo dominio que el logo del
// template de Supabase). Override con DASHBOARD_URL si cambia.
const DASHBOARD_BASE =
  process.env.DASHBOARD_URL ?? "https://www.kreatos.intelloai.com"

/**
 * Correo de "tarea terminada" al usuario que la inició (Capa 3, solo tareas
 * RAÍZ). Best-effort: sin RESEND_API_KEY, sin usuario o sin email → no-op; nunca
 * lanza (corre dentro del hook best-effort del agente).
 */
export async function notifyTaskEmail(
  userId: string | null,
  input: {
    /** Nombre/sujeto de la tarea, p. ej. "Sitio de Kepler Constructora". */
    title: string
    status: "done" | "failed"
    /** Ruta en el dashboard (se le antepone la base). */
    href?: string | null
  },
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !userId) return
  try {
    const supabase = getSupabaseClient()
    const { data } = await supabase.auth.admin.getUserById(userId)
    const to = data.user?.email
    if (!to) return

    const done = input.status === "done"
    const heading = done
      ? `${input.title} está listo`
      : `${input.title}: la tarea no se completó`
    const body = done
      ? "Tu agente terminó la tarea. Ábrela en el dashboard para revisarla."
      : "Tu agente no pudo completar la tarea. Ábrela en el dashboard para ver qué pasó y reintentar."
    const ctaHref = input.href ? `${DASHBOARD_BASE}${input.href}` : DASHBOARD_BASE

    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Kreatos <onboarding@resend.dev>",
      to,
      subject: heading,
      react: TaskCompleteEmail({ heading, body, ctaHref }),
    })
  } catch {
    // best-effort
  }
}
