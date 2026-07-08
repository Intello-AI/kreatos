import { alibaba } from "@ai-sdk/alibaba"
import { anthropic } from "@ai-sdk/anthropic"
import { deepseek } from "@ai-sdk/deepseek"
import { openai } from "@ai-sdk/openai"
import { gateway, type LanguageModel } from "ai"

/**
 * Router de modelo por TIPO DE TAREA de los tools — NO del orquestador (ese es
 * SITE_BUILDER_MODEL). Un solo lugar para elegir y A/B el modelo barato de cada
 * clase de trabajo interno de las tools.
 *
 * INSIGHT: qwen falló como ORQUESTADOR (adherencia débil en 40+ pasos
 * autónomos), pero DENTRO de un tool cada llamada es UN generateText
 * (single-shot, no loop) — su debilidad no aplica. Su hogar ideal son los tools.
 *
 * REGLA DE ORO: abarata generación/transcripción/traducción; NUNCA el juez
 * visual (`vision-judge` = el gate que caza el demo/diseño malo).
 *
 * Override por env (una palanca por tarea, formato "provider:model"):
 *   TOOL_MODEL_CODEGEN=openai:gpt-5.4-mini   # A/B qwen ↔ gpt-5.4-mini
 *   TOOL_MODEL_CODEGEN=zai:glm-5.2           # GLM 5.2 vía Vercel AI Gateway
 *   TOOL_MODEL_CODEGEN=deepseek:deepseek-v4-pro  # DeepSeek V4 Pro vía gateway
 * Providers: openai (default) | anthropic | alibaba | deepseek (nativo
 * @ai-sdk/deepseek, DEEPSEEK_API_KEY) | zai (→ Vercel AI Gateway, slug
 * "zai/<model>", AI_GATEWAY_API_KEY en dev / OIDC en prod) | gateway (slug
 * completo). El label del modelo = la parte tras ":" (p. ej. "glm-5.2"), así
 * casa con la llave de model_pricing.
 */
export type ToolTask =
  | "transcribe" // draft_surface: theme.css/fonts.ts, pura transcripción
  | "codegen" // draft_section: escribe una custom .tsx
  | "translate" // translate_copy
  | "vision-extract" // view_reference/capture: LEER una imagen
  | "vision-judge" // review_screenshots: JUZGAR el diseño (gate) — no abaratar
  | "brand-vision" // analyze_brand_image: VE el logo/paleta del lead (extracción)
  | "summarize" // describe_current_site: resume estructura/HTML a JSON

const DEFAULTS: Record<ToolTask, string> = {
  transcribe: "openai:gpt-5-nano",
  // draft_section (escribe cada custom .tsx). DEFAULT = DeepSeek V4 Pro (coding
  // fuerte, ~1/7 del input de Sonnet + cache extremo). RETADOR en A/B = GLM 5.2
  // (José cree que GLM > GPT en código; gana a gpt-5.5 en coding long-horizon):
  //   TOOL_MODEL_CODEGEN=zai:glm-5.2      # probar GLM
  //   TOOL_MODEL_CODEGEN=anthropic:claude-sonnet-5   # volver a Sonnet
  // Es single-shot → sin riesgo de adherencia; codegen = ~1.8% del costo del
  // build, así que aquí manda la CALIDAD del componente, no el precio. Compara
  // previews del mismo giro; el label ("glm-5.2"/"deepseek-v4-pro") cae en
  // build_summary para leer el costo real. El gate visual review_screenshots
  // SIGUE en Sonnet (vision-judge) — caza el componente feo pase lo que pase.
  codegen: "deepseek:deepseek-v4-pro",
  translate: "alibaba:qwen3.7-plus",
  "vision-extract": "openai:gpt-5-mini",
  "vision-judge": "anthropic:claude-sonnet-5",
  "brand-vision": "openai:gpt-5-mini",
  summarize: "openai:gpt-5-mini",
}

const ENV_VAR: Record<ToolTask, string> = {
  transcribe: "TOOL_MODEL_TRANSCRIBE",
  codegen: "TOOL_MODEL_CODEGEN",
  translate: "TOOL_MODEL_TRANSLATE",
  "vision-extract": "TOOL_MODEL_VISION_EXTRACT",
  "vision-judge": "TOOL_MODEL_VISION_JUDGE",
  "brand-vision": "TOOL_MODEL_BRAND_VISION",
  summarize: "TOOL_MODEL_SUMMARIZE",
}

function spec(task: ToolTask): string {
  return process.env[ENV_VAR[task]] ?? DEFAULTS[task]
}

/** "provider:model" → instancia de LanguageModel. */
function resolve(s: string): LanguageModel {
  const idx = s.indexOf(":")
  const provider = idx === -1 ? "openai" : s.slice(0, idx)
  const model = idx === -1 ? s : s.slice(idx + 1)
  switch (provider) {
    case "anthropic":
      return anthropic(model)
    case "alibaba":
      return alibaba(model)
    // "zai:glm-5.2" → gateway("zai/glm-5.2"). El label queda "glm-5.2" (parte
    // tras ":"), así atribuye a la misma llave de model_pricing.
    case "zai":
      return gateway(`zai/${model}`)
    // "deepseek:deepseek-v4-pro" → provider NATIVO @ai-sdk/deepseek (API
    // directa, requiere DEEPSEEK_API_KEY). El label queda "deepseek-v4-pro".
    case "deepseek":
      return deepseek(model)
    // Slug de gateway ya completo, p. ej. "gateway:zai/glm-5.2".
    case "gateway":
      return gateway(model)
    case "openai":
    default:
      return openai(model)
  }
}

/** Modelo (LanguageModel) para una tarea de tool. Override por env. */
export function toolModel(task: ToolTask): LanguageModel {
  return resolve(spec(task))
}

/**
 * Etiqueta corta del modelo de una tarea (p. ej. "qwen3.7-plus") — para
 * `recordToolUsage`, así las vistas de costo atribuyen al modelo REAL usado.
 */
export function toolModelLabel(task: ToolTask): string {
  const s = spec(task)
  const idx = s.indexOf(":")
  return idx === -1 ? s : s.slice(idx + 1)
}
