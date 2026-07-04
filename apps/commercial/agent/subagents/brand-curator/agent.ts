import { anthropic } from "@ai-sdk/anthropic"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Cura la identidad de marca de un lead conversando con José: recibe fotos/logos subidos al inbox del lead, los VE (visión), decide cuál sirve de logo y cuáles como imágenes del sitio, extrae paletas en tokens, y guarda la ficha de marca. Delegar aquí 'cura/carga la marca del lead X' y todo mensaje con [Contexto: lead <uuid>] sobre marca.",
  // Curaduría visual conversacional.
  model: anthropic("claude-opus-4-8"),
})
