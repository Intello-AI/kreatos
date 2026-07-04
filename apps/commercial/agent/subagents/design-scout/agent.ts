import { anthropic } from "@ai-sdk/anthropic"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Analiza sitios web de referencia (URLs que José carga en design_references): extrae sitemap, secciones, componentes, paleta, tipografía y qué robar/qué no, y guarda el análisis para que site-builder lo use en la fase de spec. Delegar aquí 'analiza las referencias pendientes' o 'analiza esta URL de referencia'.",
  // Criterio de diseño fino: el análisis ES el valor de la biblioteca.
  model: anthropic("claude-opus-4-8"),
})
