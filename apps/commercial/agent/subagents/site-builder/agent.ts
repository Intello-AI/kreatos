import { alibaba } from "@ai-sdk/alibaba"
import { anthropic } from "@ai-sdk/anthropic"
import { deepseek } from "@ai-sdk/deepseek"
import { openai } from "@ai-sdk/openai"
import { gateway, type LanguageModel } from "ai"
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
//   SITE_BUILDER_MODEL=glm      → zai/glm-5.2 vía Vercel AI Gateway (Z.ai,
//                                 $1.4/$4.4 in/out list, cache $0.26; ctx 1M;
//                                 open-weights que gana a gpt-5.5 en coding
//                                 long-horizon a ~1/6 del costo). Ruteo default
//                                 del gateway = Z.ai; hay proveedores más
//                                 baratos (Novita/OpenRouter ~$0.9 in) si se
//                                 fija provider. Requiere AI_GATEWAY_API_KEY
//                                 (dev: .env.local; prod: OIDC automático de
//                                 Vercel en kreatos-agent — no hace falta key).
//     CACHING: GLM NO es provider "anthropic" → la auto-cache de eve (abajo)
//     NO aplica (mismo caso que qwen). El gateway expone el cache implícito de
//     Z.ai si el endpoint lo reporta (cache_read $0.26 = 0.19x del input);
//     pésalo en el A/B igual que con qwen.
//   SITE_BUILDER_MODEL=deepseek  → deepseek-v4-pro vía provider NATIVO
//                                 @ai-sdk/deepseek (API directa de DeepSeek, NO
//                                 gateway). $0.435/$0.87 in/out — input base ~7x
//                                 más barato que Sonnet; ctx 1M; hybrid-attention,
//                                 reasoning/agentic. Requiere DEEPSEEK_API_KEY
//                                 (dev: .env.local; prod: env de kreatos-agent).
//                                 Los alias legacy deepseek-chat/deepseek-reasoner
//                                 se retiran 2026-07-24; usamos el id vigente.
//     CACHING: tampoco es "anthropic" → auto-cache de eve NO aplica. PERO el
//     cache implícito de DeepSeek (context caching, automático server-side) es
//     EXTREMO: cache_read $0.003625 = 0.008x del input (vs 0.1x de Sonnet/GPT).
//     Si el prefijo es estable, el input efectivo se desploma — el gran
//     atractivo de costo de esta opción.
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
//   SITE_BUILDER_MODEL=sonnet   → claude-sonnet-5 (era el DEFAULT; ahora opt-in)
//   sin definir                 → gpt-5.4 (DEFAULT desde 2026-07-07). MEDIDO en
//     prod (35 builds reales): el ORQUESTADOR es el multiplicador #1 de costo/
//     tiempo — builds dominados por Sonnet median $9.95/37min vs gpt-5.4-mini
//     $0.90/9.8min (~11x costo, ~4x wall, MISMO trabajo). El loop agéntico
//     (bash/edit/read/write) = 76.8% de pasos y 74.8% del costo → abaratar el
//     orquestador es LA palanca. El juez visual (review_screenshots) sigue en
//     Sonnet: NO se abarata. A/B siguiente: SITE_BUILDER_MODEL=deepseek (aún más
//     barato) — pero valida adherencia en 55-147 pasos (riesgo tipo qwen).
// Se evalúa al compilar el agente: en dev, cambia .env.local y reinicia;
// en prod, cambia la env en Vercel (kreatos-agent) y redeploy.
const MODEL_TOGGLE: Record<string, LanguageModel> = {
  sonnet: anthropic("claude-sonnet-5"),
  gpt: openai("gpt-5.4"),
  "gpt-mini": openai("gpt-5.4-mini"),
  qwen: alibaba("qwen3.7-plus"),
  glm: gateway("zai/glm-5.2"),
  deepseek: deepseek("deepseek-v4-pro"),
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
  // Default = gpt-5.4 (ver toggle arriba: dato de prod — Sonnet-orquestador ~11x
  // costo / ~4x tiempo por el MISMO build). Sonnet sigue disponible con
  // SITE_BUILDER_MODEL=sonnet para A/B de calidad; el juez visual queda en Sonnet.
  model: toggledModel ?? openai("gpt-5.4"),
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
