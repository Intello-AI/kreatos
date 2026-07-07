import { alibaba } from "@ai-sdk/alibaba"
import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"

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
 */
export type ToolTask =
  | "transcribe" // draft_surface: theme.css/fonts.ts, pura transcripción
  | "codegen" // draft_section: escribe una custom .tsx
  | "translate" // translate_copy
  | "vision-extract" // view_reference/capture: LEER una imagen
  | "vision-judge" // review_screenshots: JUZGAR el diseño (gate) — no abaratar
  | "brand-vision" // analyze_brand_image: VE el logo/paleta del lead (extracción)

const DEFAULTS: Record<ToolTask, string> = {
  transcribe: "openai:gpt-5-nano",
  codegen: "alibaba:qwen3.7-plus",
  translate: "alibaba:qwen3.7-plus",
  "vision-extract": "openai:gpt-5-mini",
  "vision-judge": "anthropic:claude-sonnet-5",
  "brand-vision": "openai:gpt-5-mini",
}

const ENV_VAR: Record<ToolTask, string> = {
  transcribe: "TOOL_MODEL_TRANSCRIBE",
  codegen: "TOOL_MODEL_CODEGEN",
  translate: "TOOL_MODEL_TRANSLATE",
  "vision-extract": "TOOL_MODEL_VISION_EXTRACT",
  "vision-judge": "TOOL_MODEL_VISION_JUDGE",
  "brand-vision": "TOOL_MODEL_BRAND_VISION",
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
