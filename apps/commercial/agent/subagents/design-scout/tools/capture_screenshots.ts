import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSupabaseClient } from "../../../lib/supabase"
import { toolModel, toolModelLabel } from "../../../lib/tool-models"
import { recordToolUsage } from "../../../lib/tool-usage"

// Copia literal del CHROMIUM_BOOTSTRAP de ../sandbox/sandbox.ts (un import
// cruzado tool↔sandbox rompe el bundler de eve) — si cambias uno, cambia el
// otro. Instala chromium + libs de sistema (dnf en Amazon Linux 2023 del
// Vercel Sandbox, apt en docker local).
const CHROMIUM_DNF_DEPS =
  "nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXfixes libXrandr mesa-libgbm alsa-lib pango cairo"
const CHROMIUM_BOOTSTRAP = `cd /tmp && pnpm dlx playwright@1.61.1 install chromium && ((command -v dnf >/dev/null 2>&1 && (sudo dnf install -yq ${CHROMIUM_DNF_DEPS} || dnf install -yq ${CHROMIUM_DNF_DEPS})) || (command -v apt-get >/dev/null 2>&1 && pnpm dlx playwright@1.61.1 install-deps chromium))`

// Proyecto mínimo con la lib de playwright (los browsers ya los precalienta
// el bootstrap del sandbox al cache global, misma versión = misma revisión).
const SHOT_LIB_SETUP = `mkdir -p /opt/shot && cd /opt/shot && ([ -f package.json ] || echo '{"name":"shot","private":true}' > package.json) && (node -e "require.resolve('playwright')" >/dev/null 2>&1 || pnpm add playwright@1.61.1)`

/**
 * Captura con navegador REAL (no el CLI): recorre la página completa antes
 * del screenshot para disparar los reveals whileInView y el lazy-load —
 * el CLI de playwright no scrollea y los sitios animados salían con
 * secciones en blanco. reducedMotion acelera las animaciones que lo
 * respetan; el scroll + settle cubre el resto.
 * Uso: node shot.mjs <url> <out.png> <width> <height> <fullPage 0|1>
 */
const SHOT_SCRIPT = `import { chromium } from "playwright";

const [, , url, out, width, height, fullPage] = process.argv;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: Number(width), height: Number(height) },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(async () => {
    // networkidle nunca llega en sitios con polling: caer a load + espera.
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
  });
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 180));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: out, fullPage: fullPage === "1" });
} finally {
  await browser.close();
}
`

const VISUAL_PROMPT = `Eres un director de arte senior. Estas son capturas full-page REALES de un sitio de referencia (desktop 1440px y mobile 390px, más páginas interiores si las hay). Complementa un teardown de CSS con lo que SOLO se ve renderizado:

1. **Above the fold** (desktop): qué domina el primer viewport, jerarquía real (qué se lee 1º/2º/3º), proporción texto/imagen.
2. **Composición por scroll**: ritmo de las secciones (alturas relativas, alternancia de fondos/temas, dónde respira y dónde se densifica).
3. **Ritmo cromático visible**: cómo se usan los bloques de color a lo largo de la página (no los hex — el EFECTO).
4. **Jerarquía tipográfica percibida**: contraste real de tamaños, qué tan agresivos son los saltos.
5. **Mobile**: cómo colapsa la retícula, qué se sacrifica, si el hero sigue funcionando, tamaño de tipografía relativo.
6. **Páginas interiores** (si hay capturas): cómo estructuran una página que NO es la home — header propio, densidad, qué patrón repiten y qué cambia.
7. **Detalles robables**: 2-4 gestos concretos visibles que un CSS no revela (overlaps, sangrados, tratamiento de imágenes, densidad de la nav).

Responde en español, prosa compacta por punto, TODO anclado a lo que se VE.`

function safeRouteName(path: string, index: number): string {
  const safe = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40)
  return `route-${index + 1}${safe ? `-${safe}` : ""}`
}

export default defineTool({
  description:
    "Captura screenshots full-page REALES de una referencia (desktop 1440px + mobile 390px + miniatura card, y páginas interiores vía `paths`) con Playwright en el sandbox — con scroll completo previo para disparar animaciones whileInView y lazy-load. Sube todo a Storage, guarda los paths en design_references y devuelve un análisis VISUAL con visión. Úsalo en cada referencia ANTES de save_reference_analysis.",
  inputSchema: z.object({
    slug: z.string().min(1).describe("Slug de la referencia en design_references."),
    url: z.string().url(),
    paths: z
      .array(z.string().startsWith("/"))
      .max(5)
      .default([])
      .describe(
        "Rutas interiores a capturar además de la home ('/nosotros', '/servicios'...) — sácalas del nav del HTML que ya leíste; 2-4 con contenido distinto entre sí. Solo desktop full-page por ruta.",
      ),
  }),
  async execute({ slug, url, paths }, ctx) {
    const sandbox = await ctx.getSandbox()

    // El script SIEMPRE se (re)escribe: idempotente y a prueba de snapshots
    // viejos. La lib de playwright se asegura una vez por sandbox.
    await sandbox.writeTextFile({ path: "/opt/shot/shot.mjs", content: SHOT_SCRIPT })
    await sandbox.run({ command: SHOT_LIB_SETUP })

    const origin = url.replace(/\/+$/, "")
    const shots: Array<{
      name: string
      file: string
      pageUrl: string
      width: number
      height: number
      fullPage: boolean
      toVision: boolean
    }> = [
      // Archivos temporales SIEMPRE prefijados por slug: el sandbox es uno
      // solo y el agente captura varias referencias en paralelo — nombres
      // compartidos mezclaban screenshots entre referencias.
      { name: "desktop", file: `${slug}-desktop`, pageUrl: url, width: 1440, height: 900, fullPage: true, toVision: true },
      { name: "mobile", file: `${slug}-mobile`, pageUrl: url, width: 390, height: 844, fullPage: true, toVision: true },
      // card: SOLO el viewport para la miniatura del dashboard — los
      // full-page de miles de px reventaban Safari iOS por memoria.
      { name: "card", file: `${slug}-card`, pageUrl: url, width: 1280, height: 800, fullPage: false, toVision: false },
      ...paths.map((path, i) => ({
        name: safeRouteName(path, i),
        file: `${slug}-${safeRouteName(path, i)}`,
        pageUrl: `${origin}${path}`,
        width: 1440,
        height: 900,
        fullPage: true,
        // A visión van las primeras 2 rutas (la ventana de imágenes no es infinita).
        toVision: i < 2,
      })),
    ]

    const failedRoutes: string[] = []
    for (const shot of shots) {
      const shotCommand = `cd /opt/shot && node shot.mjs "${shot.pageUrl}" /tmp/${shot.file}.png ${shot.width} ${shot.height} ${shot.fullPage ? 1 : 0}`
      let capture = await sandbox.run({ command: shotCommand })
      // Self-healing por tipo de fallo: lib faltante (snapshot viejo) o
      // browser/libs del sistema faltantes (bootstrap fallido).
      if (capture.exitCode !== 0) {
        const failText = `${capture.stderr}${capture.stdout}`
        if (failText.includes("Cannot find") || failText.includes("ERR_MODULE_NOT_FOUND")) {
          await sandbox.run({ command: "cd /opt/shot && pnpm add playwright@1.61.1" })
          capture = await sandbox.run({ command: shotCommand })
        } else if (
          failText.includes("playwright install") ||
          failText.includes("shared libraries") ||
          failText.includes("Executable doesn't exist")
        ) {
          await sandbox.run({ command: CHROMIUM_BOOTSTRAP })
          capture = await sandbox.run({ command: shotCommand })
        }
      }
      if (capture.exitCode !== 0) {
        // Las capturas de la HOME son obligatorias; una ruta interior caída
        // (404, redirect raro) no tira la referencia completa.
        if (shot.name.startsWith("route-")) {
          failedRoutes.push(shot.pageUrl)
          continue
        }
        throw new Error(
          `La captura ${shot.name} falló (exit ${capture.exitCode}): ${[capture.stderr, capture.stdout].filter(Boolean).join("\n").slice(-500)}`,
        )
      }
      // Versión reducida para visión (el full-page puede pesar >8MB). La
      // card no va a visión: es solo la miniatura del dashboard.
      if (shot.toVision) {
        await sandbox.run({
          command: `cd /tmp && (ffmpeg -y -i ${shot.file}.png -vf "scale='min(1100,iw)':-2" -q:v 6 ${shot.file}.review.jpg 2>/dev/null || cp ${shot.file}.png ${shot.file}.review.jpg)`,
        })
      }
    }

    const supabase = getSupabaseClient()
    const supabaseUrl = process.env.SUPABASE_URL ?? ""
    const publicUrls: Record<string, string> = {}
    const reviewImages: Array<{ name: string; bytes: Uint8Array }> = []

    for (const shot of shots) {
      const bytes = await sandbox.readBinaryFile({ path: `/tmp/${shot.file}.png` })
      if (!bytes) {
        if (shot.name.startsWith("route-")) continue
        throw new Error(`No se pudo leer ${shot.file}.png del sandbox.`)
      }
      const path = `${slug}/${shot.name}.png`
      const { error } = await supabase.storage
        .from("design-references")
        .upload(path, bytes, { contentType: "image/png", upsert: true })
      if (error) {
        throw new Error(`Upload de ${shot.name} falló: ${error.message}`)
      }
      publicUrls[shot.name] =
        `${supabaseUrl}/storage/v1/object/public/design-references/${path}`

      if (!shot.toVision) continue
      const review = await sandbox.readBinaryFile({
        path: `/tmp/${shot.file}.review.jpg`,
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
        model: toolModel("vision-extract"),
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
      await recordToolUsage(ctx, "design-scout", toolModelLabel("vision-extract"), result.usage)
      visualAnalysis = result.text
    }

    return {
      desktopUrl: publicUrls["desktop"],
      mobileUrl: publicUrls["mobile"],
      routeUrls: Object.fromEntries(
        Object.entries(publicUrls).filter(([k]) => k.startsWith("route-")),
      ),
      ...(failedRoutes.length > 0 ? { failedRoutes } : {}),
      visualAnalysis,
      hint: "Integra el análisis visual al teardown (composición/jerarquía/color con lo VISTO, no solo el CSS) antes de save_reference_analysis.",
    }
  },
})
