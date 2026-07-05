import { openai } from "@ai-sdk/openai"
import { defineAgent } from "eve"

// Orquestador. La experiencia con gpt-5-mini (2026-07-04): ignoraba las
// reglas de encadenamiento (preguntaba "¿confirmas?", cortaba cadenas a
// medias, pedía IDs que ya traía el [Contexto: ...]). El ruteo es el paso
// más frecuente Y el que más fricción humana genera cuando falla — aquí el
// modelo mejor se paga solo. Toggle ROOT_MODEL para experimentar (p. ej.
// "gpt-5-mini" para volver al barato).
const rootModel = process.env.ROOT_MODEL || "gpt-5.1"

export default defineAgent({
  model: openai(rootModel),
  reasoning: "medium",
  limits: {
    // Guardrail de costo, NO de seguridad. OJO: es por SESIÓN DURABLE, que
    // en este agente puede vivir días y muchos turnos (una conversación de
    // dashboard no se cierra sola) — no por turno. 300k tumbaba conversaciones
    // sanas a media tarde. El root escribe poco (rutas + resúmenes), así que
    // el techo real lo ponen los límites por sesión de cada subagente; aquí
    // dejamos margen amplio para que una sesión larga no muera por el cap.
    maxOutputTokensPerSession: 2_000_000,
  },
})
