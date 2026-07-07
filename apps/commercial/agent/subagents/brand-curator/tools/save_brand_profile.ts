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
    fonts: z
      .array(z.string())
      .optional()
      .describe(
        "Fuentes de la marca (de scrape_brand_site.fonts): el par tipográfico REAL del sitio. Referencia para el site-builder, no mandato.",
      ),
    services: z
      .array(z.object({ name: z.string(), description: z.string() }))
      .optional(),
    differentiators: z.string().optional(),
    notes: z.string().optional(),
    voice: z
      .object({
        tone: z
          .string()
          .describe(
            'Tono en una frase: "corporativo y sobrio", "cercano y cálido", "premium minimalista"...',
          ),
        register: z.enum(["usted", "tu"]),
        personality: z.string().describe("Personalidad de la marca en 1-2 frases."),
        keywords: z.array(z.string()).default([]),
        avoid: z
          .array(z.string())
          .default([])
          .describe("Palabras/estilos que la marca NO usa."),
      })
      .optional()
      .describe("Voz de marca extraída de su sitio/redes o dictada por José."),
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
    imageDescriptions: z
      .array(
        z.object({
          description: z
            .string()
            .describe("Qué muestra la imagen, en una frase (de analyze_brand_image)."),
          use: z
            .string()
            .optional()
            .describe('Uso sugerido en el sitio: "hero", "equipo", "retrato", "oficina", "portafolio"…'),
          person: z
            .string()
            .optional()
            .describe("Si es un retrato con banda de nombre: el nombre de la persona."),
          role: z
            .string()
            .optional()
            .describe("Si hay banda de cargo: el cargo/rol (p. ej. 'Contadora Senior')."),
        }),
      )
      .optional()
      .describe(
        "Alineado 1:1 con imagePaths: qué muestra cada imagen, su uso y (retratos) nombre/cargo. El site-builder los usa para nombrar/colocar SIN re-visionar.",
      ),
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

    // Merge sobre lo existente: solo se pisa lo enviado.
    const { data: existing } = await supabase
      .from("lead_brand")
      .select("*")
      .eq("lead_id", input.leadId)
      .maybeSingle()

    // Descripción por imagen, keyed por la ruta FINAL (dest): robusto al
    // dedup/merge de `images`. Se conserva lo previo y se pisa por ruta.
    const imageMeta: Record<string, unknown> = {
      ...((existing?.image_meta as Record<string, unknown> | null) ?? {}),
    }
    const images: string[] = []
    for (const [i, source] of (input.imagePaths ?? []).entries()) {
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
      const meta = input.imageDescriptions?.[i]
      if (meta) imageMeta[dest] = meta
    }

    const prevImages = (existing?.images as string[] | null) ?? []
    const { error } = await supabase.from("lead_brand").upsert(
      {
        lead_id: input.leadId,
        short_name: input.shortName ?? existing?.short_name ?? null,
        tagline: input.tagline ?? existing?.tagline ?? null,
        colors: (input.colors ?? existing?.colors ?? []) as never,
        fonts: (input.fonts ?? existing?.fonts ?? []) as never,
        services: (input.services ?? existing?.services ?? []) as never,
        differentiators:
          input.differentiators ?? existing?.differentiators ?? null,
        notes: input.notes ?? existing?.notes ?? null,
        voice: (input.voice ?? existing?.voice ?? null) as never,
        images: Array.from(new Set([...prevImages, ...images])) as never,
        image_meta: imageMeta as never,
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
