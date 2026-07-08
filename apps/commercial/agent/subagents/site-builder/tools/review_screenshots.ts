import { generateText } from "ai"
import { defineTool } from "eve/tools"
import { z } from "zod"

import { toolModel, toolModelLabel } from "../../../lib/tool-models"
import { recordToolTiming, recordToolUsage } from "../../../lib/tool-usage"

/**
 * Director de arte con visión: revisa los screenshots que `pnpm qa` dejó en
 * .qa/screenshots/ ANTES de pushear. Un par de ojos con criterio de diseño
 * (claude-sonnet-5, visión) que juzga lo renderizado de verdad — no el código.
 * Es el GATE del push: por eso el mejor ojo para "agencia vs plantilla".
 */

const REVIEW_PROMPT = `Eres un director de arte senior revisando la ENTREGA de un sitio corporativo que se vende por cientos de dólares. Te paso screenshots reales de los modos que el sitio REALMENTE ofrece al visitante: si solo hay capturas light, el sitio es light-only (sin toggle) y el dark NO existe para el visitante — NO lo pidas ni lo penalices; juzga solo lo que te paso. Sé exigente: "correcto pero mediocre" NO se aprueba. El pecado capital que MÁS debes cazar: que se vea a PLANTILLA — el mismo sitio con otro color.

Cada issue lleva un **axis**: **"structural"** = algo ROTO, objetivo, verificable (lo bloquea el push); **"aesthetic"** = criterio de diseño, subjetivo (mejora la calidad pero NO bloquea de forma dura — se re-gatea con el humano). Clasifica bien: el axis decide si frenas la entrega o solo la anotas.

Revisa en este orden:
1. **Roto — critical + axis:"structural"** (SOLO cosas objetivamente rotas): texto desbordado o cortado, elementos encimados, imágenes deformadas o FALTANTES (icono roto, cuadro vacío donde debía ir una imagen que no cargó), overflow horizontal en mobile, texto **ilegible por contraste**: mismo color que su fondo (invisible), **o texto OSCURO sobre una foto/overlay de tonos medios u oscuros** — el caso típico es el titular del hero full-bleed que sale en color oscuro sobre la imagen y se pierde: el copy sobre imágenes DEBE ser claro (color "primary-foreground", no el "foreground" oscuro del tema) y saltar de lo que tiene detrás. La legibilidad de texto sobre foto es OBJETIVA y estructural; si tienes que forzar la vista para leer el titular, es structural, NO lo bajes a "contraste mejorable". Y SOLO si te paso capturas dark: colores sin invertir. NADA subjetivo entra aquí.
   - OJO: **el espacio negativo deliberado NO es "media pantalla vacía"**. Un hero split/editorial 60/40 con un lado respirando es DISEÑO correcto, no un hueco — solo repórtalo si es claramente una imagen que no cargó o una columna que debía tener contenido y quedó en blanco.
   - **EXCEPCIÓN — mapa de Google (sección contacto):** el iframe de Google Maps NO renderiza en capturas headless (lazy-load bloqueado por el navegador automatizado), así que en /contacto o en el contacto de la home suele verse como una caja bordeada vacía junto al formulario. **Eso NO es un critical** — el mapa funciona en producción; es limitación de la captura. NO lo reportes ni pidas que se quite el mapa.
2. **Mal diseño — major + axis:"aesthetic"** (subjetivo, sube calidad, no bloquea duro):
   - **MONOTONÍA / PLANTILLA (el más importante)**: si 3+ secciones comparten el MISMO esqueleto (eyebrow mayúsculas + título display + grid/lista con bordes), se ve templated aunque cambie el copy. Cuéntalas; nómbralo "monotonía de layout" y di cuántas se repiten. Un sitio de $500 tiene ritmo: densidades, composiciones y pesos DISTINTOS.
   - jerarquía plana, spacing inconsistente, hero débil, secciones de relleno, logo mal escalado, tipografía sin carácter, acento por todos lados o por ninguno, **contraste mejorable pero legible SOBRE FONDO SÓLIDO** (muted un poco bajo en una sección de color plano — molesta, no rompe). OJO: esto es SOLO para texto sobre fondo sólido; texto sobre IMAGEN/foto que no contrasta va en el punto 1 (structural), nunca aquí.
   OJO placeholders: este sitio es un DEMO de venta — un placeholder DISEÑADO (banda de logos con rectángulos tipográficos, portafolio de stock con treatment) es CORRECTO y no se reporta; uno descuidado (caja punteada "LOGO", relleno visible, stock sin treatment) sí es major.
3. **Pulible — minor + axis:"aesthetic"**: microdetalles de alineación, espaciado mejorable.

Verifica contra el CONCEPTO del sitio que te doy: ¿se ve como ESE concepto, o como cualquier plantilla corporativa? Si dos negocios distintos saldrían casi iguales, falta dirección de arte — dilo sin rodeos.

Si te paso los issues de una pasada PREVIA: re-márcalos SOLO si SIGUEN presentes en estos screenshots. Un critical NUEVO que no estaba antes debe ser "structural" (algo que se rompió), nunca un matiz estético que antes no viste. Sé reproducible: ante los mismos pixeles, el mismo veredicto — no inventes criticals distintos en cada revisión.

Responde SOLO JSON válido (sin markdown):
{
  "approved": true/false,           // false si hay critical structural o 2+ major
  "verdict": "una frase honesta de director de arte",
  "issues": [
    { "severity": "critical|major|minor", "axis": "structural|aesthetic", "screen": "nombre del archivo", "issue": "qué está mal, concreto", "fix": "instrucción accionable (archivo/sección si lo puedes inferir)" }
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
    referenceScreenshotUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "screenshotUrl de la referencia GUÍA del brief (si existe): el revisor compara la dirección de arte lograda contra ella.",
      ),
    // Visión es el costo por-token más alto del pipeline. 6 cubre lo que juzga
    // el director (home desktop light+dark+mobile + 2-3 interiores clave) sin
    // pagar 8-10 fullpages. Subir solo si un sitio tiene muchas páginas densas.
    maxImages: z.number().int().min(1).max(10).default(6),
    routes: z
      .array(z.string())
      .optional()
      .describe(
        "En una RE-review tras un fix puntual: rutas afectadas (p. ej. ['/servicios']). Limita la visión a esas + home (siempre incluida para el juicio de monotonía) → no re-manda rutas intactas. OMITE en la primera review (juzga TODO).",
      ),
  }),
  async execute({ concept, referenceScreenshotUrl, maxImages, routes }, ctx) {
    const sandbox = await ctx.getSandbox()

    // Anti-wander: lee el veredicto PREVIO (si existe) para (a) pasarle al
    // reviewer los issues ya señalados —que re-marque solo lo que SIGUE, no
    // invente un critical distinto cada pasada (el loop de Almex)— y (b) llevar
    // un contador de pasadas.
    let priorPass = 0
    let priorIssuesBlock = ""
    {
      const prev = await sandbox.run({
        command: `cat site/.qa/review.json 2>/dev/null || echo ""`,
      })
      const txt = prev.stdout.trim()
      if (txt) {
        try {
          const prior = JSON.parse(txt) as {
            pass?: number
            issues?: Array<Record<string, unknown>>
          }
          priorPass = typeof prior.pass === "number" ? prior.pass : 0
          const arr = Array.isArray(prior.issues) ? prior.issues : []
          if (arr.length > 0) {
            priorIssuesBlock = `\n\nISSUES DE LA PASADA PREVIA (el equipo dice haberlos corregido — re-márcalos SOLO si SIGUEN presentes en estos screenshots; un critical NUEVO debe ser structural):\n${arr
              .map(
                (i) =>
                  `- [${i.severity ?? "?"}/${i.axis ?? "?"}] ${i.screen ?? "?"}: ${i.issue ?? ""}`,
              )
              .join("\n")}`
          }
        } catch {
          // prior ilegible: se trata como pasada limpia.
        }
      }
    }

    const list = await sandbox.run({
      command: `ls site/.qa/screenshots/*.png 2>/dev/null | head -20`,
    })
    const allFiles = list.stdout
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean)
    if (allFiles.length === 0) {
      throw new Error(
        "No hay screenshots en site/.qa/screenshots/ — corre `pnpm qa` primero (revisa que el paso screenshots no haya fallado en .qa/qa-report.json).",
      )
    }

    // Scoping opcional: en una re-review, solo las rutas tocadas + home
    // (siempre, para el juicio de monotonía). El slug de "/" es "home", el de
    // "/servicios" es "servicios" (así nombra screenshots.ts). Sin `routes`,
    // se juzga todo.
    const routeSlugs =
      routes && routes.length > 0
        ? routes.map((r) => (r === "/" ? "home" : r.replace(/\//g, "")))
        : null
    const scoped = routeSlugs
      ? allFiles.filter((f) => {
          const base = f.split("/").pop() ?? ""
          return (
            base.startsWith("home") ||
            routeSlugs.some((s) => base.startsWith(s))
          )
        })
      : allFiles
    // Si el scope quedó vacío (rutas que no matchean ningún png), juzga todo.
    const files = scoped.length > 0 ? scoped : allFiles

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
      // Cap ANCHO ≤1100 y ALTO ≤7600: un fullpage muy largo tras capar solo el
      // ancho seguía pasando el límite de 8000px/lado de la API de visión (que
      // rechaza el mensaje entero). El segundo scale acota el alto conservando
      // aspecto.
      await sandbox.run({
        command: `ffmpeg -y -i "${file}" -vf "scale='min(1100,iw)':-2,scale=-2:'min(7600,ih)'" -q:v 6 "${jpg}" 2>/dev/null || cp "${file}" "${jpg}"`,
      })
      const bytes = await sandbox.readBinaryFile({ path: jpg })
      if (!bytes || bytes.byteLength > 8 * 1024 * 1024) continue
      const name = file.split("/").pop() ?? file
      images.push({ name, bytes })
    }
    if (images.length === 0) {
      throw new Error("No se pudo leer ningún screenshot del sandbox.")
    }

    // Referencia guía (opcional): el revisor compara la dirección lograda
    // contra la que José eligió — dirección, no copia.
    let referenceImage: Uint8Array | null = null
    if (referenceScreenshotUrl) {
      try {
        const res = await fetch(referenceScreenshotUrl)
        if (res.ok) {
          const raw = new Uint8Array(await res.arrayBuffer())
          // Las referencias son capturas fullpage y suelen exceder el límite de
          // 8000px/lado de la API de visión (p. ej. flexport = 1440×8705 → la
          // API rechaza el mensaje ENTERO). Downscale en el sandbox con el MISMO
          // cap que los screenshots (≤1100 ancho, ≤7600 alto) antes de mandarla.
          if (raw.byteLength <= 12 * 1024 * 1024) {
            await sandbox.writeBinaryFile({
              path: "site/.qa/reference.src",
              content: raw,
            })
            await sandbox.run({
              command: `rm -f site/.qa/reference.jpg && ffmpeg -y -i site/.qa/reference.src -vf "scale='min(1100,iw)':-2,scale=-2:'min(7600,ih)'" -q:v 6 site/.qa/reference.jpg 2>/dev/null`,
            })
            const jpg = await sandbox.readBinaryFile({
              path: "site/.qa/reference.jpg",
            })
            if (jpg && jpg.byteLength > 0 && jpg.byteLength <= 8 * 1024 * 1024) {
              referenceImage = jpg
            }
          }
        }
      } catch {
        // sin referencia: el review procede igual
      }
    }

    const result = await generateText({
      model: toolModel("vision-judge"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${REVIEW_PROMPT}\n\nCONCEPTO del sitio:\n${concept}\n\nScreenshots en orden: ${images.map((i) => i.name).join(", ")}${priorIssuesBlock}${
                referenceImage
                  ? "\n\nLa ÚLTIMA imagen es la REFERENCIA GUÍA elegida por el humano: evalúa si el sitio logró una dirección de arte del mismo nivel (composición, jerarquía, ritmo) SIN copiarla — pareceres de calidad, no de semejanza. Añade un campo \"referenceComparison\" al JSON con tu veredicto en 1-2 frases."
                  : ""
              }`,
            },
            ...images.map((img) => ({
              type: "image" as const,
              image: img.bytes,
              mediaType: "image/jpeg" as const,
            })),
            ...(referenceImage
              ? [
                  {
                    type: "image" as const,
                    image: referenceImage,
                    mediaType: "image/jpeg" as const,
                  },
                ]
              : []),
          ],
        },
      ],
    })
    await recordToolUsage(ctx, "site-builder", toolModelLabel("vision-judge"), result.usage)

    const raw = result.text.trim().replace(/^```(?:json)?\n?|```$/g, "")
    // Persistir el veredicto en site/.qa/review.json: push_site_version lo lee
    // como GATE determinista (approved:false o critical bloquean el push). Sin
    // esto el review solo "aconsejaba" y un sitio genérico se entregaba igual.
    // Se escribe SIEMPRE (incluso si el JSON no parseó: un marcador que fuerza
    // re-review) vía base64 para no pelear con el quoting del shell.
    const persist = async (obj: unknown) => {
      const payload = Buffer.from(JSON.stringify(obj)).toString("base64")
      await sandbox.run({
        command: `mkdir -p site/.qa && echo ${payload} | base64 -d > site/.qa/review.json`,
      })
    }
    try {
      const review = JSON.parse(raw) as Record<string, unknown>
      // pass: contador determinista de pasadas de review sobre este sitio —
      // el gate/instrucciones lo usan para el techo de 2 rediseños.
      const pass = priorPass + 1
      // Telemetría de CALIDAD (Fase 0): el veredicto del juez a tool_timing para
      // que el A/B de modelos vea si el barato hace sitios PEORES (más rondas de
      // QA, no aprobado, más issues) — no solo si es más barato.
      const issues = Array.isArray(review.issues) ? review.issues : []
      const sev = (s: string) =>
        issues.filter(
          (i) => (i as { severity?: string })?.severity === s,
        ).length
      void recordToolTiming(ctx, "site-builder", "review_screenshots", 0, {
        ok: review.approved === true,
        meta: {
          pass,
          approved: review.approved === true,
          critical: sev("critical"),
          major: sev("major"),
          model: toolModelLabel("vision-judge"),
        },
      })
      await persist({ ...review, pass })
      return {
        screensReviewed: images.map((i) => i.name),
        review: { ...review, pass },
      }
    } catch {
      // JSON ilegible: guardar un veredicto no-aprobado para que el gate exija
      // re-correr el review en vez de dejar pasar por ausencia de archivo.
      void recordToolTiming(ctx, "site-builder", "review_screenshots", 0, {
        ok: false,
        meta: { pass: priorPass + 1, approved: false, parseFail: true },
      })
      await persist({
        approved: false,
        verdict: "El review no devolvió JSON válido; re-córrelo.",
        issues: [],
        pass: priorPass + 1,
      })
      return {
        screensReviewed: images.map((i) => i.name),
        review: null,
        rawText: raw.slice(0, 3000),
      }
    }
  },
})
