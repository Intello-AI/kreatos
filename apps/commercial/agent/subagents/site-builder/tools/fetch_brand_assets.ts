import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"
import { getSite } from "../lib/sites"

/**
 * Materialización mecánica de los assets de marca en UNA llamada: descarga
 * logo/isotipo/fotos de la ficha al repo clonado (optimizadas) y genera los
 * iconos estáticos de app/ según la convención. Sustituye ~10 comandos
 * manuales de curl/ffmpeg — menos pasos, menos errores, menos tokens.
 */

function extOf(path: string): string {
  return (path.split(".").pop() ?? "png").toLowerCase()
}

export default defineTool({
  description:
    "Descarga TODOS los assets de la ficha de marca al repo clonado en un solo paso: logo → public/images/logo.<ext>, isotipo → public/images/icon.<ext> + iconos estáticos de app/ (icon.svg o icon.png + favicon.ico + apple-icon.png con fondo sólido), y fotos aprobadas → public/images/brand-<n>.webp (ffmpeg q80, máx 1600px). Úsalo en fase build justo después de clone_site_repo (y en re-materializaciones). Requiere el clone en /workspace/site.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    appleIconBackground: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .describe(
        "Fondo sólido del apple-icon (hex del background del theme del spec). Sin él se usa #ffffff.",
      ),
  }),
  async execute({ siteId, appleIconBackground }, ctx) {
    const site = await getSite(siteId)
    const supabase = getSupabaseClient()
    const { data: brand } = await supabase
      .from("lead_brand")
      .select("logo_path, icon_path, images")
      .eq("lead_id", site.lead_id)
      .maybeSingle()
    if (!brand) {
      return {
        downloaded: [],
        hint: "El lead no tiene ficha de marca: aplica la política de datos faltantes (sin logo inventado; monograma SVG para app/icon.svg).",
      }
    }

    const sandbox = await ctx.getSandbox()
    const supabaseUrl = process.env.SUPABASE_URL ?? ""
    const publicUrl = (path: string) =>
      `${supabaseUrl}/storage/v1/object/public/brand-assets/${path}`
    const downloaded: string[] = []
    const problems: string[] = []

    await sandbox.run({ command: "mkdir -p site/public/images" })

    const fetchToSandbox = async (url: string, dest: string) => {
      const res = await sandbox.run({
        command: `curl -fsSL "${url}" -o "${dest}"`,
      })
      if (res.exitCode !== 0) {
        problems.push(`descarga falló: ${dest} (${res.stderr.slice(0, 120)})`)
        return false
      }
      return true
    }

    // ——— Logo ———
    if (brand.logo_path) {
      const ext = extOf(brand.logo_path)
      const dest = `site/public/images/logo.${ext}`
      if (await fetchToSandbox(publicUrl(brand.logo_path), dest)) {
        downloaded.push(dest)
      }
    }

    // ——— Isotipo + iconos estáticos de app/ ———
    let icons: string[] = []
    if (brand.icon_path) {
      const ext = extOf(brand.icon_path)
      const src = `site/public/images/icon.${ext}`
      if (await fetchToSandbox(publicUrl(brand.icon_path), src)) {
        downloaded.push(src)
        if (ext === "svg") {
          // SVG: Next lo sirve como favicon moderno tal cual.
          await sandbox.run({ command: `cp "${src}" site/app/icon.svg` })
          icons = ["site/app/icon.svg"]
        } else {
          const bg = appleIconBackground ?? "#ffffff"
          const result = await sandbox.run({
            command: [
              `ffmpeg -y -i "${src}" -vf "scale='min(512,iw)':-2" site/app/icon.png`,
              `ffmpeg -y -i "${src}" -vf "scale=48:48:force_original_aspect_ratio=decrease,pad=48:48:(ow-iw)/2:(oh-ih)/2:color=${bg}@0" site/app/favicon.ico`,
              `ffmpeg -y -i "${src}" -vf "scale=132:132:force_original_aspect_ratio=decrease,pad=180:180:(ow-iw)/2:(oh-ih)/2:color=${bg.replace("#", "0x")}" site/app/apple-icon.png`,
            ].join(" && "),
          })
          if (result.exitCode === 0) {
            icons = [
              "site/app/icon.png",
              "site/app/favicon.ico",
              "site/app/apple-icon.png",
            ]
          } else {
            problems.push(
              `generación de iconos falló: ${[result.stderr, result.stdout].filter(Boolean).join("\n").slice(-300)}`,
            )
          }
        }
      }
    }

    // ——— Fotos aprobadas → webp optimizado ———
    const images = ((brand.images as string[] | null) ?? []).filter(Boolean)
    for (const [i, path] of images.entries()) {
      const tmp = `/tmp/brand-src-${i}.${extOf(path)}`
      const dest = `site/public/images/brand-${i + 1}.webp`
      if (!(await fetchToSandbox(publicUrl(path), tmp))) continue
      const opt = await sandbox.run({
        command: `ffmpeg -y -i "${tmp}" -vf "scale='min(1600,iw)':-2" -quality 80 "${dest}" 2>/dev/null || cp "${tmp}" "site/public/images/brand-${i + 1}.${extOf(path)}"`,
      })
      downloaded.push(
        opt.exitCode === 0 ? dest : `site/public/images/brand-${i + 1}.${extOf(path)}`,
      )
    }

    return {
      downloaded,
      icons,
      problems: problems.length > 0 ? problems : undefined,
      hint: "Declara business.logo/business.icon en site.config.ts con estas rutas. Las brand-N.webp RENÓMBRALAS SIEMPRE a nombre semántico antes de usarlas (hero.webp, nosotros.webp, servicio-1.webp): todos los repos deben navegarse igual para ediciones manuales.",
    }
  },
})
