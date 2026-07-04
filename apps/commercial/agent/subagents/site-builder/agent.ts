import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

// Toggle de modelo del site-builder (experimento de costo/calidad):
//   SITE_BUILDER_MODEL=gpt    → gpt-5.1 (tier equivalente, ~60% más barato)
//   sin definir / "sonnet"    → claude-sonnet-5 (default)
// Se evalúa al compilar el agente: en dev, cambia .env.local y reinicia;
// en prod, cambia la env en Vercel (kreatos-agent) y redeploy.
const useGpt = process.env.SITE_BUILDER_MODEL === "gpt"

export default defineAgent({
  description:
    "Construye el sitio web de un lead: compone el spec de diseño desde el brief y la biblioteca de referencias, genera el código en su sandbox a partir del template de kreatos, pasa QA y despliega un preview en Vercel. Delegar aquí 'genera/itera/publica el sitio del site <uuid> / lead X'.",
  // Sonnet 5: sobrado para materializar specs con el andamiaje actual
  // (skills + referencias + ficha + guards + review visual). gpt-5.1 es el
  // contendiente directo — comparar previews del mismo giro antes de decidir.
  model: useGpt ? openai("gpt-5.1") : anthropic("claude-sonnet-5"),
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
