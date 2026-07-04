import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

const analysisSchema = z
  .object({
    sitemap: z.array(z.string()),
    // Teardown senior: composición, espaciado, tipografía y uso del color.
    layout: z
      .object({
        container: z.string(),
        composition: z.string(),
        density: z.string(),
      })
      .partial()
      .optional(),
    spacing: z
      .object({
        scale: z.array(z.number()),
        rhythm: z.string(),
      })
      .partial()
      .optional(),
    typography: z
      .object({
        families: z.record(z.string(), z.string()),
        scale: z.string(),
        hierarchy: z.string(),
      })
      .partial()
      .optional(),
    color: z
      .object({
        palette: z.record(z.string(), z.string()),
        contrast: z.string(),
        separators: z.string(),
      })
      .partial()
      .optional(),
    hierarchy: z.string().optional(),
    // Paleta de la referencia TRADUCIDA al sistema de tokens del template
    // (shadcn: background/foreground/primary/accent/muted/border/ring...).
    // Punto de partida directo para theme.css de site-builder.
    tokens: z
      .object({
        light: z.record(z.string(), z.string()),
        dark: z.record(z.string(), z.string()),
        radius: z.string().optional(),
        inferred: z
          .string()
          .optional()
          .describe("Qué tokens son inferencia (no confirmados en el CSS)."),
      })
      .partial()
      .optional(),
    sections: z.array(
      z.object({
        order: z.number().int(),
        kind: z.string(),
        notes: z.string(),
      }),
    ),
    components: z.array(z.string()),
    motion: z.string().optional(),
    imagery: z.string().optional(),
    notes: z.string(),
  })
  .passthrough()

export default defineTool({
  description:
    "Guarda el análisis completo de una referencia de diseño (status analyzed) o la marca failed si la URL no se pudo analizar.",
  inputSchema: z.object({
    referenceId: z.string().uuid(),
    failed: z
      .boolean()
      .default(false)
      .describe("true si la URL no respondió/bloqueó; explica en layoutNotes."),
    analysis: analysisSchema.optional(),
    industries: z
      .array(z.string())
      .default([])
      .describe("Giros donde aplica: contable, legal, construccion..."),
    styleTags: z.array(z.string()).default([]),
    palette: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Colores confirmados en el CSS: {"bg":"#0b0b0c","accent":"#b45309"}'),
    typography: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Fuentes reales: {"display":"GT Sectra","body":"Inter"}'),
    layoutNotes: z.string().optional(),
    doSteal: z.string().optional(),
    dontSteal: z.string().optional(),
    qualityScore: z.number().int().min(1).max(5).optional(),
  }),
  async execute(input) {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from("design_references")
      .update({
        status: input.failed ? "failed" : "analyzed",
        analyzed_at: new Date().toISOString(),
        analysis: (input.analysis ?? null) as never,
        industries: input.industries,
        style_tags: input.styleTags,
        palette: (input.palette ?? null) as never,
        typography: (input.typography ?? null) as never,
        layout_notes: input.layoutNotes ?? null,
        do_steal: input.doSteal ?? null,
        dont_steal: input.dontSteal ?? null,
        quality_score: input.qualityScore ?? null,
        active: !input.failed,
      })
      .eq("id", input.referenceId)
    if (error) throw new Error(`Guardado del análisis falló: ${error.message}`)
    return { ok: true, status: input.failed ? "failed" : "analyzed" }
  },
})
