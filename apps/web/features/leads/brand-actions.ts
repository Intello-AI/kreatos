"use server"

import { revalidatePath } from "next/cache"

import { getAdminClient } from "@/lib/supabase/admin"

export interface BrandActionState {
  ok?: boolean
  formError?: string
}

export interface LeadBrandData {
  short_name: string | null
  logo_path: string | null
  colors: string[]
  tagline: string | null
  services: Array<{ name: string; description: string }>
  differentiators: string | null
  notes: string | null
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
    colors: (data.colors as string[]) ?? [],
    tagline: data.tagline,
    services:
      (data.services as Array<{ name: string; description: string }>) ?? [],
    differentiators: data.differentiators,
    notes: data.notes,
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

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
