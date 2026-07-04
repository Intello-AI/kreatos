import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

// Orquestador: routing de delegación fiable. Requiere ANTHROPIC_API_KEY en
// apps/commercial/.env.local.
export default defineAgent({
  model: openai("gpt-5-mini"),
})
