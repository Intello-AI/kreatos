"use server"

import { revalidatePath } from "next/cache"

import { getAdminClient } from "@/lib/supabase/admin"
import { getEveClient } from "@/lib/eve"

export interface ReferenceActionState {
  ok?: boolean
  formError?: string
  added?: number
  skipped?: number
  /** true si design-scout ya quedó analizando en background. */
  analysisStarted?: boolean
}

/** Arranca la sesión de análisis de pendientes con design-scout. */
async function startAnalysis(count: number): Promise<boolean> {
  try {
    const eve = getEveClient()
    const session = eve.session()
    await session.send(
      `Analiza las referencias de diseño pendientes de la biblioteca (hay ${count}). Analízalas todas.`,
    )
    return true
  } catch {
    return false
  }
}

function slugFromUrl(raw: string): string {
  const url = new URL(raw)
  return `${url.hostname}${url.pathname}`
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/**
 * Da de alta URLs de referencia (una por línea) como `pending`. El análisis
 * lo hace el subagente design-scout — ver analyzeReferences.
 */
export async function addReferences(
  urlsText: string,
): Promise<ReferenceActionState> {
  const lines = urlsText
    .split(/\s+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return { formError: "Pega al menos una URL." }

  const rows: Array<{ slug: string; url: string; source: string }> = []
  for (const line of lines) {
    try {
      const url = new URL(line.startsWith("http") ? line : `https://${line}`)
      rows.push({
        slug: slugFromUrl(url.toString()),
        url: url.toString(),
        source: "manual",
      })
    } catch {
      return { formError: `URL inválida: ${line}` }
    }
  }

  const supabase = getAdminClient()
  // upsert ignorando duplicados por slug: recargar la misma URL no la duplica.
  const { data, error } = await supabase
    .from("design_references")
    .upsert(rows, { onConflict: "slug", ignoreDuplicates: true })
    .select("id")
  if (error) {
    return { formError: `No se pudieron guardar: ${error.message}` }
  }

  const added = data?.length ?? 0

  // Al agregar, el análisis arranca solo (no requiere click extra). Cuenta
  // TODAS las pendientes por si quedaron de antes.
  let analysisStarted = false
  if (added > 0) {
    const { count } = await supabase
      .from("design_references")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
    analysisStarted = await startAnalysis(count ?? added)
  }

  revalidatePath("/dashboard/references")
  return {
    ok: true,
    added,
    skipped: rows.length - added,
    analysisStarted,
  }
}

/** Referencias analizadas (para el select de "referencia guía" del brief). */
export async function listAnalyzedReferences(): Promise<
  Array<{ slug: string; url: string }>
> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("design_references")
    .select("slug, url")
    .eq("status", "analyzed")
    .eq("active", true)
    .order("quality_score", { ascending: false })
  return (data ?? []) as Array<{ slug: string; url: string }>
}

/**
 * Re-análisis de una referencia (analizada, fallida o atorada): la regresa a
 * `pending` y manda al scout a re-capturarla y sobreescribir su análisis.
 */
export async function reanalyzeReference(
  id: string,
): Promise<ReferenceActionState> {
  const supabase = getAdminClient()
  const { data: ref, error } = await supabase
    .from("design_references")
    .update({ status: "pending" })
    .eq("id", id)
    .select("slug, url")
    .single()
  if (error || !ref) {
    return {
      formError: `No se pudo marcar: ${error?.message ?? "la referencia no existe"}`,
    }
  }

  let started = false
  try {
    const eve = getEveClient()
    await eve
      .session()
      .send(
        `Re-analiza la referencia de diseño ${ref.url} (slug ${ref.slug}): quedó marcada como pendiente. Vuelve a capturar sus screenshots y sobreescribe su análisis completo.`,
      )
    started = true
  } catch {
    started = false
  }
  if (!started) {
    return {
      formError:
        "Quedó pendiente, pero no se pudo arrancar el agente; usa Analizar pendientes.",
    }
  }

  revalidatePath("/dashboard/references")
  return { ok: true, analysisStarted: true }
}

/** Manda al agente a analizar todas las referencias pendientes. */
export async function analyzeReferences(): Promise<ReferenceActionState> {
  const supabase = getAdminClient()
  const { count } = await supabase
    .from("design_references")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
  if (!count) return { formError: "No hay referencias pendientes." }

  const started = await startAnalysis(count)
  if (!started) {
    return { formError: "No se pudo arrancar el análisis; revisa el agente." }
  }

  revalidatePath("/dashboard/references")
  return { ok: true, analysisStarted: true }
}
