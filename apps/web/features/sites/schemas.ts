import { z } from "zod"

/** Brief del dialog "Generar sitio". Se guarda tal cual en sites.brief. */
export const siteBriefSchema = z.object({
  preset: z.enum(["auto", "obsidiana", "cantera", "ruta", "bodega", "norte"]),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #rrggbb.")
    .optional()
    .or(z.literal("")),
  instructions: z
    .string()
    .max(2000, "Máximo 2000 caracteres.")
    .optional()
    .or(z.literal("")),
  contactForm: z.boolean(),
})

export type SiteBriefInput = z.infer<typeof siteBriefSchema>

export interface SiteActionState {
  formError?: string
}
