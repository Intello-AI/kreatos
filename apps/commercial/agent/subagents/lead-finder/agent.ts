import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Busca negocios locales SIN sitio web en Google Maps (Places API) para una categoría y ciudad dadas, los califica con criterios de calidad y los guarda como leads en Supabase. Delegar aquí cualquier pedido de encontrar/buscar leads nuevos.",
  model: openai("gpt-5-nano"),
})
