import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

export default defineTool({
  description:
    "Descarga imágenes EXTERNAS (URLs directas, p. ej. encontradas al escrapear) al inbox de marca del lead en Storage, con nombre significativo. Corre en el runtime de la app (con credenciales) — nunca intentes subir al bucket desde bash/sandbox.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    images: z
      .array(
        z.object({
          url: z.string().url(),
          name: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .describe("Nombre significativo en kebab-case, sin extensión: hero, nosotros, portafolio-1…"),
        }),
      )
      .min(1)
      .max(15),
  }),
  async execute({ leadId, images }) {
    const supabase = getSupabaseClient()
    const supabaseUrl = process.env.SUPABASE_URL ?? ""
    const stored: Array<{ source: string; path: string; url: string }> = []
    const failed: Array<{ url: string; reason: string }> = []

    for (const image of images) {
      try {
        const res = await fetch(image.url, { headers: { "user-agent": UA } })
        const type = res.headers.get("content-type") ?? ""
        if (!res.ok || !type.startsWith("image/")) {
          failed.push({ url: image.url, reason: `${res.status} ${type}` })
          continue
        }
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.byteLength > 8 * 1024 * 1024) {
          failed.push({ url: image.url, reason: ">8MB" })
          continue
        }
        const ext = type.includes("svg")
          ? "svg"
          : type.includes("webp")
            ? "webp"
            : type.includes("png")
              ? "png"
              : "jpg"
        const path = `${leadId}/inbox/${image.name}.${ext}`
        const { error } = await supabase.storage
          .from("brand-assets")
          .upload(path, bytes, { contentType: type, upsert: true })
        if (error) {
          failed.push({ url: image.url, reason: error.message })
          continue
        }
        stored.push({
          source: image.url,
          path,
          url: `${supabaseUrl}/storage/v1/object/public/brand-assets/${path}`,
        })
      } catch (err) {
        failed.push({
          url: image.url,
          reason: err instanceof Error ? err.message : "fetch falló",
        })
      }
    }

    return { stored, failed }
  },
})
