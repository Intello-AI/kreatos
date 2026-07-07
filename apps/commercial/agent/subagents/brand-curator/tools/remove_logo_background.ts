import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

/**
 * Quita el fondo de un logo (blanco/color sólido) dejándolo TRANSPARENTE, para
 * que se vea limpio sobre headers oscuros o de color. Usa la API de remove.bg
 * (REMOVE_BG_API_KEY). Sin la key es un no-op explícito: NO inventes transparencia.
 *
 * Cuándo: un logo/isotipo bueno pero con fondo blanco/de color. NO para fotos ni
 * para un logo que ya trae transparencia (revisa `analyze_brand_image` primero).
 */

export default defineTool({
  description:
    "Quita el fondo de un logo/isotipo (blanco o color sólido) y lo deja TRANSPARENTE (PNG) para que se vea limpio sobre cualquier fondo. Guarda el resultado en el inbox y devuelve su ruta — úsala como logoSourcePath/iconSourcePath en save_brand_profile. Requiere REMOVE_BG_API_KEY; sin ella devuelve ok:false (no inventa transparencia). Solo para logos con fondo sólido, no para fotos ni logos que ya son transparentes.",
  inputSchema: z.object({
    leadId: z.string().uuid(),
    sourcePath: z
      .string()
      .describe(
        "Ruta del logo en el bucket brand-assets (p. ej. <leadId>/inbox/logo.png).",
      ),
  }),
  async execute({ leadId, sourcePath }) {
    const key = process.env.REMOVE_BG_API_KEY
    if (!key) {
      return {
        ok: false as const,
        hint: "REMOVE_BG_API_KEY no está configurada: no puedo quitar el fondo. Usa el logo tal cual (fondo blanco) o pídele a José la key de remove.bg. NO inventes un logo transparente.",
      }
    }
    const supabaseUrl = process.env.SUPABASE_URL ?? ""
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/brand-assets/${sourcePath}`

    let out: Uint8Array
    try {
      const res = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: {
          "X-Api-Key": key,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          image_url: publicUrl,
          size: "auto",
          format: "png",
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300)
        return {
          ok: false as const,
          status: res.status,
          hint: `remove.bg respondió ${res.status}: ${detail}. Revisa la key/cuota o usa el logo con su fondo actual.`,
        }
      }
      out = new Uint8Array(await res.arrayBuffer())
    } catch (err) {
      return {
        ok: false as const,
        hint: `No se pudo contactar remove.bg (${err instanceof Error ? err.message : "timeout"}). Usa el logo con su fondo actual.`,
      }
    }

    const base = (sourcePath.split("/").pop() ?? "logo").replace(/\.[^.]+$/, "")
    const dest = `${leadId}/inbox/${base}-nobg.png`
    const { error } = await getSupabaseClient()
      .storage.from("brand-assets")
      .upload(dest, out, { contentType: "image/png", upsert: true })
    if (error) {
      throw new Error(`No se pudo guardar el logo sin fondo: ${error.message}`)
    }

    return {
      ok: true as const,
      path: dest,
      url: `${supabaseUrl}/storage/v1/object/public/brand-assets/${dest}`,
      bytes: out.byteLength,
      hint: "Logo con fondo transparente guardado. Pásalo como logoSourcePath (o iconSourcePath si es cuadrado) en save_brand_profile. Verifícalo con analyze_brand_image si dudas del recorte.",
    }
  },
})
