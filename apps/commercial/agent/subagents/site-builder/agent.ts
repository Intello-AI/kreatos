import { alibaba } from "@ai-sdk/alibaba"
import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { defineAgent } from "eve"

// Toggle de modelo del site-builder (experimento de costo/calidad):
//   SITE_BUILDER_MODEL=gpt      → gpt-5.4 (frontier coding, $2.5/$15, ctx 1M)
//   SITE_BUILDER_MODEL=gpt-mini → gpt-5.4-mini (agentes/coding de alto
//                                 volumen, $0.75/$4.5 — 4x más barato)
//   SITE_BUILDER_MODEL=qwen     → qwen3.7-plus (Alibaba, $0.4/$1.6 in/out —
//                                 input base 8x más barato que Sonnet; ctx 1M,
//                                 function calling). Requiere ALIBABA_API_KEY
//                                 (dev: .env.local; prod: env de kreatos-agent
//                                 en Vercel).
//     CACHING: qwen SÍ cachea, pero solo el IMPLÍCITO automático del endpoint
//     (server-side, bloques de 2048 tok, cache_read $0.08 = 0.2x del input).
//     NO recibe los breakpoints explícitos de Anthropic: la auto-cache de eve
//     (invariante abajo) es anthropic-only y NO inyecta el cacheControl de
//     alibaba. Verificado empírico: read=2048/call con prefijo estable ≥2048.
//     → cobertura de cache < ~97% de Sonnet, pero el input base compensa;
//     pésalo en el A/B. El explícito (cacheControl:ephemeral, cachea el bloque
//     entero) SÍ es alcanzable sin tocar eve: envuelve el modelo con
//     wrapLanguageModel + middleware transformParams que marca el prefijo, y
//     pásalo a defineAgent({model}). Probado que dispara write/read — PERO el
//     read de qwen es intermitente (write,write,read) y el write cuesta más
//     ($0.4/1M), así que para el A/B nos quedamos en el implícito automático.
//   sin definir / "sonnet"      → claude-sonnet-5 (default)
// Se evalúa al compilar el agente: en dev, cambia .env.local y reinicia;
// en prod, cambia la env en Vercel (kreatos-agent) y redeploy.
const MODEL_TOGGLE: Record<string, LanguageModel> = {
  gpt: openai("gpt-5.4"),
  "gpt-mini": openai("gpt-5.4-mini"),
  qwen: alibaba("qwen3.7-plus"),
}
const toggledModel = MODEL_TOGGLE[process.env.SITE_BUILDER_MODEL ?? ""]

// ── INVARIANTE DE PROMPT CACHING (no romper) ────────────────────────────────
// eve activa el caching de Anthropic AUTOMÁTICAMENTE para agentes con provider
// "anthropic": marca cacheables el system prompt (instructions.md), el bloque
// de tools y los últimos turnos (4 breakpoints = el máximo de la API). En prod
// site-builder/Sonnet corre a ~97% de input servido desde cache (0.1x del
// precio). NO agregues providerOptions.anthropic.cacheControl a mano: un 5º
// breakpoint hace fallar el request o desplaza uno de los actuales y tumba el
// hit-rate (input x10). Para preservarlo:
//   1. instructions.md y el REGISTRO de tools deben ser ESTABLES por sesión.
//   2. NUNCA interpolar datos volátiles (siteId, timestamp, git sha, estado
//      vivo) al inicio del system prompt — esos van por mensajes user/tool.
//   3. Vigila la salud con la vista `cache_health` (migración cache_health):
//      si cache_read_pct de site-builder cae de ~90%, algo rompió el prefijo.
export default defineAgent({
  description:
    "Materializa, itera y PUBLICA el sitio web de un lead — el ciclo de vida completo en tres modos: (build) toma el spec vigente de art-director y genera el código en su sandbox desde el template, pasa QA visual y despliega un PREVIEW; (edit) aplica cambios post-venta sobre sitios ya construidos partiendo del CÓDIGO REAL del repo (no del spec: el humano pudo editar a mano) y completa placeholders del demo con material real; (publish) el ÚNICO que publica a producción (merge a main) cuando el humano lo pide sobre un sitio aprobado. Delegar aquí: 'materializa/genera/itera el sitio del site <uuid>', 'cámbiale/mejora X al sitio', 'publica el sitio X'.",
  // Sonnet 5: sobrado para materializar specs con el andamiaje actual
  // (skills + referencias + ficha + guards + review visual). La familia
  // gpt-5.4 es el contendiente — comparar previews del mismo giro.
  model: toggledModel ?? anthropic("claude-sonnet-5"),
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
