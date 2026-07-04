import type { Tables } from "@repo/supabase"

import { getSupabaseClient } from "../../../lib/supabase"

export type SiteRow = Tables<"sites">
export type SiteVersionRow = Tables<"site_versions">
export type DesignReferenceRow = Tables<"design_references">
export type DesignPresetRow = Tables<"design_presets">

export type SiteStatus =
  | "brief"
  | "generating"
  | "preview"
  | "approved"
  | "published"
  | "failed"

/** Transiciones válidas de status; publicar/aprobar las dispara el humano vía follow-up. */
const VALID_TRANSITIONS: Record<SiteStatus, SiteStatus[]> = {
  brief: ["generating", "failed"],
  generating: ["preview", "failed"],
  preview: ["generating", "approved", "failed"],
  approved: ["published", "generating"],
  published: ["generating"],
  failed: ["generating"],
}

export async function getSite(siteId: string): Promise<SiteRow> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", siteId)
    .maybeSingle()
  if (error) throw new Error(`Lectura de site falló: ${error.message}`)
  if (!data) throw new Error(`No existe site con id ${siteId}.`)
  return data
}

export async function getLatestVersion(
  siteId: string,
): Promise<SiteVersionRow | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("site_versions")
    .select("*")
    .eq("site_id", siteId)
    .order("version_n", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Lectura de site_versions falló: ${error.message}`)
  return data
}

export async function insertSiteVersion(input: {
  siteId: string
  spec: unknown
  changelog: string
  actor: string
}): Promise<{ versionN: number }> {
  const supabase = getSupabaseClient()
  const latest = await getLatestVersion(input.siteId)
  const versionN = (latest?.version_n ?? 0) + 1

  const { error } = await supabase.from("site_versions").insert({
    site_id: input.siteId,
    version_n: versionN,
    spec: input.spec as never,
    changelog: input.changelog,
    actor: input.actor,
  })
  if (error) throw new Error(`Insert en site_versions falló: ${error.message}`)

  const { error: updateError } = await supabase
    .from("sites")
    .update({ current_version: versionN })
    .eq("id", input.siteId)
  if (updateError)
    throw new Error(`Update de current_version falló: ${updateError.message}`)

  return { versionN }
}

export async function updateSite(
  siteId: string,
  patch: Partial<
    Pick<
      SiteRow,
      | "status"
      | "repo_url"
      | "vercel_project_id"
      | "deploy_url"
      | "eve_session_id"
      | "published_at"
    >
  >,
): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from("sites").update(patch).eq("id", siteId)
  if (error) throw new Error(`Update de site falló: ${error.message}`)
}

export async function setSiteStatus(
  siteId: string,
  status: SiteStatus,
): Promise<{ changed: boolean; previous: SiteStatus }> {
  const site = await getSite(siteId)
  const previous = site.status as SiteStatus
  // Idempotente: pedir el status vigente (retomas, reintentos) es no-op.
  if (previous === status) {
    return { changed: false, previous }
  }
  const allowed = VALID_TRANSITIONS[previous] ?? []
  if (!allowed.includes(status)) {
    throw new Error(
      `Transición inválida: ${previous} → ${status}. Permitidas: ${allowed.join(", ") || "ninguna"}.`,
    )
  }
  await updateSite(siteId, { status })
  return { changed: true, previous }
}

export async function setVersionPreview(input: {
  siteId: string
  versionN: number
  previewUrl: string
  commitSha?: string
  deploymentId?: string
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from("site_versions")
    .update({
      preview_url: input.previewUrl,
      commit_sha: input.commitSha ?? null,
      vercel_deployment_id: input.deploymentId ?? null,
      deployed_at: new Date().toISOString(),
    })
    .eq("site_id", input.siteId)
    .eq("version_n", input.versionN)
  if (error) throw new Error(`Update de preview_url falló: ${error.message}`)
}

export async function saveQaReport(input: {
  siteId: string
  versionN: number
  qaReport: unknown
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from("site_versions")
    .update({ qa_report: input.qaReport as never })
    .eq("site_id", input.siteId)
    .eq("version_n", input.versionN)
  if (error) throw new Error(`Update de qa_report falló: ${error.message}`)
}

export async function getDesignReferences(input: {
  industry: string
  styleTags?: string[]
  limit?: number
}): Promise<DesignReferenceRow[]> {
  const supabase = getSupabaseClient()
  const limit = input.limit ?? 3
  let query = supabase
    .from("design_references")
    .select("*")
    .eq("active", true)
    // Solo referencias ya analizadas por design-scout: una pending es solo
    // una URL sin decisiones de diseño.
    .eq("status", "analyzed")
    .contains("industries", [input.industry])
    .order("quality_score", { ascending: false })
    .limit(limit)
  if (input.styleTags?.length) {
    query = query.overlaps("style_tags", input.styleTags)
  }
  let { data, error } = await query
  if (error)
    throw new Error(`Lectura de design_references falló: ${error.message}`)

  // La biblioteca es transversal: composición, espaciado y contraste aplican
  // a cualquier giro. Sin match por industria → las mejores por calidad.
  if (!data || data.length === 0) {
    const fallback = await supabase
      .from("design_references")
      .select("*")
      .eq("active", true)
      .eq("status", "analyzed")
      .order("quality_score", { ascending: false })
      .limit(limit)
    if (fallback.error)
      throw new Error(
        `Lectura de design_references falló: ${fallback.error.message}`,
      )
    data = fallback.data
  }
  return data ?? []
}

export async function getDesignPresets(): Promise<DesignPresetRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("design_presets")
    .select("*")
    .eq("active", true)
  if (error) throw new Error(`Lectura de design_presets falló: ${error.message}`)
  return data ?? []
}

/**
 * Firma estructural de la home (id:variant por sección, sin navbar/footer/
 * contact que siempre existen) de los sitios más recientes — una por sitio,
 * su versión más nueva. Para la regla anti-clon: dos sitios no comparten
 * esqueleto aunque sean de giros distintos.
 */
export async function getRecentHomeSignatures(input: {
  excludeSiteId: string
  limit?: number
}): Promise<Array<{ siteId: string; signature: string[] }>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("site_versions")
    .select("spec, site_id, created_at")
    .neq("site_id", input.excludeSiteId)
    .order("created_at", { ascending: false })
    .limit(40)
  if (error) throw new Error(`Lectura de specs previos falló: ${error.message}`)

  const seen = new Set<string>()
  const out: Array<{ siteId: string; signature: string[] }> = []
  for (const row of data ?? []) {
    if (seen.has(row.site_id)) continue
    seen.add(row.site_id)
    const spec = (row.spec ?? {}) as Record<string, unknown>
    const sections = (spec["sections"] ?? []) as Array<Record<string, unknown>>
    const signature = sections
      .filter((s) => !["navbar", "footer", "contact"].includes(String(s["id"])))
      .map((s) => {
        const id = String(s["id"] ?? "")
        const key = id === "custom" ? `custom:${s["component"] ?? ""}` : id
        return `${key}:${s["variant"] ?? "-"}`
      })
    if (signature.length > 0) out.push({ siteId: row.site_id, signature })
    if (out.length >= (input.limit ?? 6)) break
  }
  return out
}

/** ¿Hay referencias analizadas disponibles? (para exigir su uso en el spec) */
export async function countAnalyzedReferences(): Promise<number> {
  const supabase = getSupabaseClient()
  const { count, error } = await supabase
    .from("design_references")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("status", "analyzed")
  if (error)
    throw new Error(`Conteo de design_references falló: ${error.message}`)
  return count ?? 0
}

/** Specs de sitios previos del mismo giro, para la regla anti-convergencia. */
export async function getSiblingSpecs(input: {
  industry: string
  excludeSiteId: string
  limit?: number
}): Promise<Array<{ preset?: string; heroVariant?: string; accent?: string }>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("site_versions")
    .select("spec, site_id")
    .neq("site_id", input.excludeSiteId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 30)
  if (error) throw new Error(`Lectura de specs previos falló: ${error.message}`)

  return (data ?? [])
    .map((row) => row.spec as Record<string, unknown>)
    .filter((spec) => spec && spec["industry"] === input.industry)
    .map((spec) => {
      const design = (spec["design"] ?? {}) as Record<string, unknown>
      const sections = (spec["sections"] ?? []) as Array<Record<string, unknown>>
      const hero = sections.find((s) => s["id"] === "hero")
      const palette = (design["palette"] ?? {}) as Record<string, unknown>
      const dark = (palette["dark"] ?? {}) as Record<string, unknown>
      return {
        preset: design["preset"] as string | undefined,
        heroVariant: hero?.["variant"] as string | undefined,
        accent: dark["accent"] as string | undefined,
      }
    })
}
