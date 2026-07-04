import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"

const VISUAL_PROMPT = `Eres un director de arte senior. Estas son capturas full-page REALES de un sitio de referencia (desktop 1440px y mobile 390px). Complementa un teardown de CSS con lo que SOLO se ve renderizado:

1. **Above the fold** (desktop): qué domina el primer viewport, jerarquía real (qué se lee 1º/2º/3º), proporción texto/imagen.
2. **Composición por scroll**: ritmo de las secciones (alturas relativas, alternancia de fondos/temas, dónde respira y dónde se densifica).
3. **Ritmo cromático visible**: cómo se usan los bloques de color a lo largo de la página (no los hex — el EFECTO).
4. **Jerarquía tipográfica percibida**: contraste real de tamaños, qué tan agresivos son los saltos.
5. **Mobile**: cómo colapsa la retícula, qué se sacrifica, si el hero sigue funcionando, tamaño de tipografía relativo.
6. **Detalles robables**: 2-4 gestos concretos visibles que un CSS no revela (overlaps, sangrados, tratamiento de imágenes, densidad de la nav).

Responde en español, prosa compacta por punto, TODO anclado a lo que se VE.`

export default defineTool({
  description:
    "Captura screenshots full-page REALES de una referencia (desktop 1440px + mobile 390px) con Playwright en el sandbox, las sube a Storage (el dashboard las muestra), las guarda en design_references y devuelve un análisis VISUAL con visión (above-the-fold, composición por scroll, ritmo cromático, mobile). Úsalo en cada referencia ANTES de save_reference_analysis: es lo que el CSS no te dice.",
  inputSchema: z.object({
    slug: z.string().min(1).describe("Slug de la referencia en design_references."),
    url: z.string().url(),
  }),
  async execute({ slug, url }, ctx) {
    const sandbox = await ctx.getSandbox()

    const shots = [
      { name: "desktop", viewport: "1440,900" },
      { name: "mobile", viewport: "390,844" },
    ]
    for (const shot of shots) {
      const shotCommand = `cd /tmp && pnpm dlx playwright@1.61.1 screenshot --viewport-size="${shot.viewport}" --full-page --wait-for-timeout=4000 "${url}" ${shot.name}.png`
      let capture = await sandbox.run({ command: shotCommand })
      // Self-healing: si el snapshot del sandbox se cacheó sin chromium (el
      // bootstrap traga errores), se instala aquí mismo y se reintenta.
      if (
        capture.exitCode !== 0 &&
        `${capture.stderr}${capture.stdout}`.includes("playwright install")
      ) {
        await sandbox.run({
          command:
            "cd /tmp && (pnpm dlx playwright@1.61.1 install chromium --with-deps || pnpm dlx playwright@1.61.1 install chromium)",
        })
        capture = await sandbox.run({ command: shotCommand })
      }
      if (capture.exitCode !== 0) {
        throw new Error(
          `La captura ${shot.name} falló (exit ${capture.exitCode}): ${[capture.stderr, capture.stdout].filter(Boolean).join("\n").slice(-500)}`,
        )
      }
      // Versión reducida para visión (el full-page puede pesar >8MB).
      await sandbox.run({
        command: `cd /tmp && (ffmpeg -y -i ${shot.name}.png -vf "scale='min(1100,iw)':-2" -q:v 6 ${shot.name}.review.jpg 2>/dev/null || cp ${shot.name}.png ${shot.name}.review.jpg)`,
      })
    }

    const supabase = getSupabaseClient()
    const supabaseUrl = process.env.SUPABASE_URL ?? ""
    const publicUrls: Record<string, string> = {}
    const reviewImages: Array<{ name: string; bytes: Uint8Array }> = []

    for (const shot of shots) {
      const bytes = await sandbox.readBinaryFile({ path: `/tmp/${shot.name}.png` })
      if (!bytes) throw new Error(`No se pudo leer ${shot.name}.png del sandbox.`)
      const path = `${slug}/${shot.name}.png`
      const { error } = await supabase.storage
        .from("design-references")
        .upload(path, bytes, { contentType: "image/png", upsert: true })
      if (error) {
        throw new Error(`Upload de ${shot.name} falló: ${error.message}`)
      }
      publicUrls[shot.name] =
        `${supabaseUrl}/storage/v1/object/public/design-references/${path}`

      const review = await sandbox.readBinaryFile({
        path: `/tmp/${shot.name}.review.jpg`,
      })
      if (review && review.byteLength <= 8 * 1024 * 1024) {
        reviewImages.push({ name: shot.name, bytes: review })
      }
    }

    await supabase
      .from("design_references")
      .update({
        screenshot_path: `${slug}/desktop.png`,
        screenshot_mobile_path: `${slug}/mobile.png`,
      })
      .eq("slug", slug)

    // Análisis con visión: lo que el CSS no revela.
    let visualAnalysis: string | null = null
    if (reviewImages.length > 0) {
      const result = await generateText({
        model: openai("gpt-5.1"),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${VISUAL_PROMPT}\n\nSitio: ${url}\nCapturas: ${reviewImages.map((i) => i.name).join(", ")}`,
              },
              ...reviewImages.map((img) => ({
                type: "image" as const,
                image: img.bytes,
                mediaType: "image/jpeg" as const,
              })),
            ],
          },
        ],
      })
      visualAnalysis = result.text
    }

    return {
      desktopUrl: publicUrls["desktop"],
      mobileUrl: publicUrls["mobile"],
      visualAnalysis,
      hint: "Integra el análisis visual al teardown (composición/jerarquía/color con lo VISTO, no solo el CSS) antes de save_reference_analysis.",
    }
  },
})
