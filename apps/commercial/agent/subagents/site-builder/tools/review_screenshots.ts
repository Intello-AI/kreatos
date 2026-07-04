import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

/**
 * Director de arte con visión: revisa los screenshots que `pnpm qa` dejó en
 * .qa/screenshots/ ANTES de pushear. Un par de ojos independiente (gpt-5.1,
 * otro proveedor) que juzga lo renderizado de verdad — no el código.
 */

const REVIEW_PROMPT = `Eres un director de arte senior revisando la ENTREGA de un sitio corporativo que se vende por cientos de dólares. Te paso screenshots reales (desktop/mobile, light/dark). Sé exigente: "correcto pero mediocre" NO se aprueba.

Revisa en este orden:
1. **Roto (critical)**: texto desbordado o cortado, elementos encimados, imágenes deformadas/faltantes (alt icons, cuadros vacíos), overflow horizontal en mobile, contraste ilegible (texto sobre fondo similar), dark mode con colores sin invertir o parches claros.
2. **Mal diseño (major)**: jerarquía plana (nada domina el viewport), spacing inconsistente entre secciones, hero débil (título genérico + botones default), secciones que parecen relleno, logo mal escalado o pixelado, tipografía sin carácter, acento usado por todos lados o por ninguno.
3. **Pulible (minor)**: microdetalles de alineación, un espaciado mejorable, una imagen que podría ser mejor.

También verifica contra el CONCEPTO del sitio que te doy: ¿los screenshots se ven como ese concepto o como una plantilla cualquiera?

Responde SOLO JSON válido (sin markdown):
{
  "approved": true/false,           // false si hay algún critical o 2+ major
  "verdict": "una frase honesta de director de arte",
  "issues": [
    { "severity": "critical|major|minor", "screen": "nombre del archivo", "issue": "qué está mal, concreto", "fix": "instrucción accionable para corregirlo (archivo/sección si lo puedes inferir)" }
  ],
  "worthTheMoney": "¿un cliente pagaría cientos de dólares por esto tal cual? sí/no y por qué en una frase"
}`

export default defineTool({
  description:
    "Revisa con VISIÓN los screenshots de .qa/screenshots/ (generados por pnpm qa) como un director de arte independiente: detecta roto (overflow, texto cortado, dark mode mal), mal diseño (jerarquía plana, hero débil) y lo compara contra el concepto del spec. Úsalo SIEMPRE después de pnpm qa y ANTES de push_site_version: con issues critical no se pushea.",
  inputSchema: z.object({
    concept: z
      .string()
      .min(30)
      .describe(
        "El design.concept del spec + 1-2 frases de qué gesto de diseño debería verse en pantalla. El revisor juzga contra esto.",
      ),
    maxImages: z.number().int().min(1).max(10).default(8),
  }),
  async execute({ concept, maxImages }, ctx) {
    const sandbox = await ctx.getSandbox()

    const list = await sandbox.run({
      command: `ls site/.qa/screenshots/*.png 2>/dev/null | head -20`,
    })
    const files = list.stdout
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean)
    if (files.length === 0) {
      throw new Error(
        "No hay screenshots en site/.qa/screenshots/ — corre `pnpm qa` primero (revisa que el paso screenshots no haya fallado en .qa/qa-report.json).",
      )
    }

    // Prioridad: home primero (desktop-light, dark, mobile), luego interiores.
    const ordered = [...files].sort((a, b) => {
      const rank = (f: string) =>
        (f.includes("home") ? 0 : 10) + (f.includes("desktop-light") ? 0 : f.includes("desktop-dark") ? 1 : 2)
      return rank(a) - rank(b)
    })
    const selected = ordered.slice(0, maxImages)

    // Downscale con ffmpeg (ya está en el sandbox): un fullpage PNG de 6MB
    // en jpg de ~150KB — mismo juicio visual, fracción del costo de visión.
    const images: Array<{ name: string; bytes: Uint8Array }> = []
    for (const file of selected) {
      const jpg = file.replace(/\.png$/, ".review.jpg")
      await sandbox.run({
        command: `ffmpeg -y -i "${file}" -vf "scale='min(1100,iw)':-2" -q:v 6 "${jpg}" 2>/dev/null || cp "${file}" "${jpg}"`,
      })
      const bytes = await sandbox.readBinaryFile({ path: jpg })
      if (!bytes || bytes.byteLength > 8 * 1024 * 1024) continue
      const name = file.split("/").pop() ?? file
      images.push({ name, bytes })
    }
    if (images.length === 0) {
      throw new Error("No se pudo leer ningún screenshot del sandbox.")
    }

    const result = await generateText({
      model: openai("gpt-5.1"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${REVIEW_PROMPT}\n\nCONCEPTO del sitio:\n${concept}\n\nScreenshots en orden: ${images.map((i) => i.name).join(", ")}`,
            },
            ...images.map((img) => ({
              type: "image" as const,
              image: img.bytes,
              mediaType: "image/jpeg" as const,
            })),
          ],
        },
      ],
    })

    const raw = result.text.trim().replace(/^```(?:json)?\n?|```$/g, "")
    try {
      const review = JSON.parse(raw) as Record<string, unknown>
      return { screensReviewed: images.map((i) => i.name), review }
    } catch {
      return {
        screensReviewed: images.map((i) => i.name),
        review: null,
        rawText: raw.slice(0, 3000),
      }
    }
  },
})
