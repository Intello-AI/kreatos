import { anthropic } from "@ai-sdk/anthropic"
import { defineAgent } from "eve"

// Orquestador: routing de delegación fiable. Requiere ANTHROPIC_API_KEY en
// apps/commercial/.env.local.
export default defineAgent({
  model: anthropic("claude-opus-4-8"),
})
