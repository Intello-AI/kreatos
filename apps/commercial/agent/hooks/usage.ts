import { makeUsageHook } from "../lib/usage"

// Root: rutea; sus mensajes rara vez traen tag de lead, así que su costo es
// overhead (no atribuido a un lead salvo que el humano incluya el contexto).
export default makeUsageHook("root", process.env.ROOT_MODEL || "gpt-5.1")
