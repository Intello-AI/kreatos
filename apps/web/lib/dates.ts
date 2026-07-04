import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { formatInTimeZone } from "date-fns-tz"

/**
 * Timezone del usuario para TODAS las fechas visibles del dashboard.
 * Se fija aquí (no en el runtime del server, que en Vercel es UTC) para que
 * server y client rendericen lo mismo sin hydration mismatch.
 */
export const USER_TIME_ZONE =
  process.env.NEXT_PUBLIC_TIME_ZONE ?? "America/Monterrey"

type DateInput = string | number | Date

function inUserTz(date: DateInput, pattern: string): string {
  try {
    return formatInTimeZone(date, USER_TIME_ZONE, pattern, { locale: es })
  } catch {
    return ""
  }
}

/** "04 jul 2026" */
export function formatDate(date: DateInput): string {
  return inUserTz(date, "dd MMM yyyy")
}

/** "04 jul, 14:23" */
export function formatDateTime(date: DateInput): string {
  return inUserTz(date, "dd MMM, HH:mm")
}

/** "14:23" */
export function formatTime(date: DateInput): string {
  return inUserTz(date, "HH:mm")
}

/** "hace 2 horas" — relativo al ahora, no depende de timezone */
export function formatRelative(date: DateInput): string {
  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: es,
    })
  } catch {
    return ""
  }
}
