import { z } from "zod"

/**
 * Brief del dialog "Generar sitio". Se guarda tal cual en sites.brief.
 * La identidad visual ya NO se elige aquí: sale de la ficha de marca del
 * lead + las referencias analizadas (el theme se deriva, no se escoge de un
 * catálogo de presets).
 */
export const siteBriefSchema = z.object({
  /** Slug de una referencia analizada para usar como guía principal. */
  referenceSlug: z.string().optional().or(z.literal("")),
  instructions: z
    .string()
    .max(2000, "Máximo 2000 caracteres.")
    .optional()
    .or(z.literal("")),
  contactForm: z.boolean(),
  /**
   * Modo de tema del sitio. `light` = solo claro, `dark` = solo oscuro,
   * `both` = ambos con botón para cambiar (themeToggle). El art-director lo
   * traduce a design.defaultMode + flags.themeToggle.
   */
  themeMode: z.enum(["light", "dark", "both"]).default("both"),
  /** Botón flotante de WhatsApp. Solo aplica si el negocio tiene WhatsApp. */
  whatsappFloat: z.boolean().default(false),
})

export type SiteBriefInput = z.infer<typeof siteBriefSchema>

export interface SiteActionState {
  formError?: string
}
