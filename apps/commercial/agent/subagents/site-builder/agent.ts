import { anthropic } from "@ai-sdk/anthropic"
import { defineAgent } from "eve"

export default defineAgent({
  description:
    "Construye el sitio web de un lead: compone el spec de diseño desde el brief y la biblioteca de referencias, genera el código en su sandbox a partir del template de kreatos, pasa QA y despliega un preview en Vercel. Delegar aquí 'genera/itera/publica el sitio del site <uuid> / lead X'.",
  // El único con Claude. Sonnet 5: sobrado para materializar specs con el
  // andamiaje actual (skills + referencias + ficha + guards), a fracción
  // del costo de Opus. Si la calidad de las secciones custom decae, subir.
  model: anthropic("claude-sonnet-5"),
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
