import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Analiza sitios web de referencia (URLs que José carga en design_references): extrae sitemap, secciones, componentes, paleta, tipografía y qué robar/qué no, y guarda el análisis para que site-builder lo use en la fase de spec. Delegar aquí 'analiza las referencias pendientes' o 'analiza esta URL de referencia'.",
  // El criterio de diseño del teardown es el valor de la biblioteca.
  model: openai("gpt-5.1"),
})
