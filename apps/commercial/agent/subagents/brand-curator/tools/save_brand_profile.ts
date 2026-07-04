import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

export default defineTool({
  description:
    "Guarda la ficha de marca del lead (merge: solo pisa lo que envías). El logo elegido se promueve del inbox a <leadId>/logo.<ext>; las imágenes aprobadas a <leadId>/images/.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    shortName: z.string().min(2).optional(),
    tagline: z.string().optional(),
    colors: z
      .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
      .optional()
      .describe("Hex, el dominante de la marca PRIMERO."),
    services: z
      .array(z.object({ name: z.string(), description: z.string() }))
      .optional(),
    differentiators: z.string().optional(),
    notes: z.string().optional(),
    logoSourcePath: z
      .string()
      .optional()
      .describe("Ruta en el bucket del logo elegido (p. ej. <leadId>/inbox/x.png)."),
    iconSourcePath: z
      .string()
      .optional()
      .describe(
        "Ruta del ISOTIPO cuadrado (favicon/app icons). Solo si hay una marca cuadrada/símbolo; un wordmark horizontal NO sirve.",
      ),
    imagePaths: z
      .array(z.string())
      .optional()
      .describe("Rutas del inbox aprobadas como imágenes del sitio."),
  }),
  async execute(input) {
    const supabase = getSupabaseClient()
    const storage = supabase.storage.from("brand-assets")

    let logoPath: string | undefined
    if (input.logoSourcePath) {
      const ext = (input.logoSourcePath.split(".").pop() ?? "png").toLowerCase()
      logoPath = `${input.leadId}/logo.${ext}`
      if (input.logoSourcePath !== logoPath) {
        await storage.remove([logoPath]).then(
          () => undefined,
          () => undefined,
        )
        const { error } = await storage.copy(input.logoSourcePath, logoPath)
        if (error) throw new Error(`No se pudo promover el logo: ${error.message}`)
      }
    }

    let iconPath: string | undefined
    if (input.iconSourcePath) {
      const ext = (input.iconSourcePath.split(".").pop() ?? "png").toLowerCase()
      iconPath = `${input.leadId}/icon.${ext}`
      if (input.iconSourcePath !== iconPath) {
        await storage.remove([iconPath]).then(
          () => undefined,
          () => undefined,
        )
        const { error } = await storage.copy(input.iconSourcePath, iconPath)
        if (error)
          throw new Error(`No se pudo promover el isotipo: ${error.message}`)
      }
    }

    const images: string[] = []
    for (const source of input.imagePaths ?? []) {
      const name = source.split("/").pop() ?? "imagen"
      const dest = `${input.leadId}/images/${name}`
      if (source !== dest) {
        await storage.remove([dest]).then(
          () => undefined,
          () => undefined,
        )
        const { error } = await storage.copy(source, dest)
        if (error)
          throw new Error(`No se pudo promover ${name}: ${error.message}`)
      }
      images.push(dest)
    }

    // Merge sobre lo existente: solo se pisa lo enviado.
    const { data: existing } = await supabase
      .from("lead_brand")
      .select("*")
      .eq("lead_id", input.leadId)
      .maybeSingle()

    const prevImages = (existing?.images as string[] | null) ?? []
    const { error } = await supabase.from("lead_brand").upsert(
      {
        lead_id: input.leadId,
        short_name: input.shortName ?? existing?.short_name ?? null,
        tagline: input.tagline ?? existing?.tagline ?? null,
        colors: (input.colors ?? existing?.colors ?? []) as never,
        services: (input.services ?? existing?.services ?? []) as never,
        differentiators:
          input.differentiators ?? existing?.differentiators ?? null,
        notes: input.notes ?? existing?.notes ?? null,
        images: Array.from(new Set([...prevImages, ...images])) as never,
        ...(logoPath ? { logo_path: logoPath } : {}),
        ...(iconPath ? { icon_path: iconPath } : {}),
      },
      { onConflict: "lead_id" },
    )
    if (error) throw new Error(`Guardado de la ficha falló: ${error.message}`)

    return {
      ok: true,
      logoPath: logoPath ?? existing?.logo_path ?? null,
      iconPath: iconPath ?? existing?.icon_path ?? null,
      imagesSaved: images,
    }
  },
})
