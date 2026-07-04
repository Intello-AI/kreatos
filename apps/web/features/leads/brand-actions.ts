"use server"

import { revalidatePath } from "next/cache"

import { getAdminClient } from "@/lib/supabase/admin"
import { getEveClient } from "@/lib/eve"

export interface BrandActionState {
  ok?: boolean
  formError?: string
}

export interface BrandVoice {
  tone?: string
  register?: "usted" | "tu"
  personality?: string
  keywords?: string[]
  avoid?: string[]
}

export interface LeadBrandData {
  short_name: string | null
  logo_path: string | null
  icon_path: string | null
  colors: string[]
  tagline: string | null
  services: Array<{ name: string; description: string }>
  differentiators: string | null
  notes: string | null
  voice: BrandVoice | null
  images: string[]
  eve_run_ids: string[]
}

/** Carga la ficha de marca de un lead (o null si no existe). */
export async function getLeadBrand(
  leadId: string,
): Promise<LeadBrandData | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("lead_brand")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle()
  if (!data) return null
  return {
    short_name: data.short_name,
    logo_path: data.logo_path,
    icon_path: data.icon_path,
    colors: (data.colors as string[]) ?? [],
    tagline: data.tagline,
    services:
      (data.services as Array<{ name: string; description: string }>) ?? [],
    differentiators: data.differentiators,
    notes: data.notes,
    voice: (data.voice as LeadBrandData["voice"]) ?? null,
    images: (data.images as string[]) ?? [],
    eve_run_ids: data.eve_run_ids ?? [],
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Sube archivos al inbox de marca del lead y devuelve sus URLs públicas.
 * El chat luego se las pasa a brand-curator en el mensaje.
 */
export async function uploadBrandAssets(
  leadId: string,
  formData: FormData,
): Promise<BrandActionState & { urls?: string[] }> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { formError: "No llegó ningún archivo." }

  const supabase = getAdminClient()
  const supabaseUrl = process.env.SUPABASE_URL ?? ""
  const urls: string[] = []
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) {
      return { formError: `${file.name} pesa más de 8 MB.` }
    }
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-")
    const path = `${leadId}/inbox/${Date.now()}-${safeName}`
    const { error } = await supabase.storage
      .from("brand-assets")
      .upload(path, file, { contentType: file.type || undefined })
    if (error) {
      return { formError: `No se pudo subir ${file.name}: ${error.message}` }
    }
    urls.push(`${supabaseUrl}/storage/v1/object/public/brand-assets/${path}`)
  }
  return { ok: true, urls }
}

/** Asegura la fila de lead_brand y devuelve su sesión eve (o null). */
async function getBrandSession(leadId: string) {
  const supabase = getAdminClient()
  await supabase
    .from("lead_brand")
    .upsert({ lead_id: leadId }, { onConflict: "lead_id", ignoreDuplicates: true })
  const { data } = await supabase
    .from("lead_brand")
    .select("eve_session_id, eve_run_ids")
    .eq("lead_id", leadId)
    .maybeSingle()
  return data ?? { eve_session_id: null, eve_run_ids: [] }
}

async function persistBrandSession(
  leadId: string,
  prevRunIds: string[],
  response: { continuationToken?: string; sessionId?: string },
) {
  if (!response.sessionId) return
  const supabase = getAdminClient()
  await supabase
    .from("lead_brand")
    .update({
      eve_session_id: response.continuationToken ?? null,
      eve_run_ids: [...prevRunIds, response.sessionId],
    })
    .eq("lead_id", leadId)
}

/** Mensaje libre del humano al chat de marca (brand-curator vía root). */
export async function sendBrandMessage(
  leadId: string,
  message: string,
): Promise<BrandActionState> {
  const trimmed = message.trim()
  if (trimmed.length < 3) return { formError: "Escribe un mensaje más largo." }

  const brand = await getBrandSession(leadId)
  try {
    const eve = getEveClient()
    const session = brand.eve_session_id
      ? eve.session(brand.eve_session_id)
      : eve.session()
    const response = await session.send(
      `[Contexto: lead ${leadId}] ${trimmed}`,
    )
    await persistBrandSession(leadId, brand.eve_run_ids ?? [], response)
  } catch (err) {
    return {
      formError: `No se pudo contactar al agente: ${err instanceof Error ? err.message : "error desconocido"}`,
    }
  }
  revalidatePath("/dashboard/leads")
  return { ok: true }
}

/** Respuesta a una pregunta pendiente (HITL) del chat de marca. */
export async function answerBrandInput(
  leadId: string,
  requestId: string,
  text: string,
  questionPrompt?: string,
): Promise<BrandActionState> {
  const trimmed = text.trim()
  if (trimmed.length < 1) return { formError: "Escribe una respuesta." }

  const brand = await getBrandSession(leadId)
  if (!brand.eve_session_id) return { formError: "No hay sesión de marca." }
  try {
    const eve = getEveClient()
    const session = eve.session(brand.eve_session_id)
    const quoted = questionPrompt?.trim()
      ? `Respondiendo a la pregunta pendiente («${questionPrompt.trim().slice(0, 180)}»): ${trimmed}`
      : trimmed
    const response = await session.send({
      message: `[Contexto: lead ${leadId}] ${quoted}`,
      inputResponses: [{ requestId, text: trimmed }],
    })
    await persistBrandSession(leadId, brand.eve_run_ids ?? [], response)
  } catch (err) {
    return {
      formError: `No se pudo responder al agente: ${err instanceof Error ? err.message : "error desconocido"}`,
    }
  }
  revalidatePath("/dashboard/leads")
  return { ok: true }
}

/**
 * Guarda la ficha de marca. `formData` trae los campos del sheet; el logo
 * (si viene) se sube al bucket brand-assets y se guarda su ruta.
 */
export async function saveLeadBrand(
  leadId: string,
  formData: FormData,
): Promise<BrandActionState> {
  const supabase = getAdminClient()

  const colors = String(formData.get("colors") ?? "")
    .split(/[,\s]+/)
    .map((c) => c.trim())
    .filter(Boolean)
  for (const color of colors) {
    if (!HEX_RE.test(color)) {
      return { formError: `Color inválido: ${color} (usa #rrggbb).` }
    }
  }

  // "Nombre: descripción" por línea → [{name, description}]
  const services = String(formData.get("services") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split(":")
      return { name: name.trim(), description: rest.join(":").trim() }
    })

  let logoPath: string | undefined
  const logo = formData.get("logo")
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 2 * 1024 * 1024) {
      return { formError: "El logo debe pesar menos de 2 MB." }
    }
    const ext = (logo.name.split(".").pop() ?? "png").toLowerCase()
    if (!["png", "svg", "jpg", "jpeg", "webp"].includes(ext)) {
      return { formError: "Formato de logo no soportado (png/svg/jpg/webp)." }
    }
    logoPath = `${leadId}/logo.${ext}`
    const { error: uploadError } = await supabase.storage
      .from("brand-assets")
      .upload(logoPath, logo, { upsert: true, contentType: logo.type })
    if (uploadError) {
      return { formError: `No se pudo subir el logo: ${uploadError.message}` }
    }
  }

  const nullable = (key: string) => {
    const value = String(formData.get(key) ?? "").trim()
    return value || null
  }

  const { error } = await supabase.from("lead_brand").upsert(
    {
      lead_id: leadId,
      short_name: nullable("short_name"),
      tagline: nullable("tagline"),
      colors,
      services,
      differentiators: nullable("differentiators"),
      notes: nullable("notes"),
      ...(logoPath ? { logo_path: logoPath } : {}),
    },
    { onConflict: "lead_id" },
  )
  if (error) {
    return { formError: `No se pudo guardar la ficha: ${error.message}` }
  }

  revalidatePath("/dashboard/leads")
  return { ok: true }
}
