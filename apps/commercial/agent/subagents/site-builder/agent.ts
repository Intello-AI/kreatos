import { anthropic } from "@ai-sdk/anthropic"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Construye el sitio web de un lead: compone el spec de diseño desde el brief y la biblioteca de referencias, genera el código en su sandbox a partir del template de kreatos, pasa QA y despliega un preview en Vercel. Delegar aquí 'genera/itera/publica el sitio del site <uuid> / lead X'.",
  // El sitio ES el producto: el único con Claude (Opus 4.8).
  model: anthropic("claude-opus-4-8"),
})
