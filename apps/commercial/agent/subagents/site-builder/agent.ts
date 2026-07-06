import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

// Toggle de modelo del site-builder (experimento de costo/calidad):
//   SITE_BUILDER_MODEL=gpt      → gpt-5.4 (frontier coding, $2.5/$15, ctx 1M)
//   SITE_BUILDER_MODEL=gpt-mini → gpt-5.4-mini (agentes/coding de alto
//                                 volumen, $0.75/$4.5 — 4x más barato)
//   sin definir / "sonnet"      → claude-sonnet-5 (default)
// Se evalúa al compilar el agente: en dev, cambia .env.local y reinicia;
// en prod, cambia la env en Vercel (kreatos-agent) y redeploy.
const MODEL_TOGGLE: Record<string, string> = {
  gpt: "gpt-5.4",
  "gpt-mini": "gpt-5.4-mini",
}
const gptModel = MODEL_TOGGLE[process.env.SITE_BUILDER_MODEL ?? ""]

export default defineAgent({
  description:
    "Materializa, itera y PUBLICA el sitio web de un lead — el ciclo de vida completo en tres modos: (build) toma el spec vigente de art-director y genera el código en su sandbox desde el template, pasa QA visual y despliega un PREVIEW; (edit) aplica cambios post-venta sobre sitios ya construidos partiendo del CÓDIGO REAL del repo (no del spec: el humano pudo editar a mano) y completa placeholders del demo con material real; (publish) el ÚNICO que publica a producción (merge a main) cuando el humano lo pide sobre un sitio aprobado. Delegar aquí: 'materializa/genera/itera el sitio del site <uuid>', 'cámbiale/mejora X al sitio', 'publica el sitio X'.",
  // Sonnet 5: sobrado para materializar specs con el andamiaje actual
  // (skills + referencias + ficha + guards + review visual). La familia
  // gpt-5.4 es el contendiente — comparar previews del mismo giro.
  model: gptModel ? openai(gptModel) : anthropic("claude-sonnet-5"),
  // Compactar temprano: menos contexto por llamada = builds largos no
  // acumulan input tan rápido y el modelo no trabaja al borde de la ventana.
  compaction: {
    thresholdPercent: 0.7,
  },
  // Un build completo (spec + clone + custom sections + QA con reintentos)
  // rebasa el default de subagente (5M input acumulado) y la sesión moría a
  // media corrida ("session reached its configured input token limit").
  limits: {
    maxInputTokensPerSession: 30_000_000,
  },
})
