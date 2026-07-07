import { defineTool } from "eve/tools"
import { z } from "zod"

import { getSite } from "../lib/sites"
import { getDeploymentBuildLog, getLatestDeployment } from "../lib/vercel"

// El build-log de Vercel puede ser de miles de líneas; devolverlo COMPLETO lo
// mete al contexto y CADA step siguiente lo re-lee (cacheado, pero suma) — es
// grasa pura para diagnosticar un error que vive en ~20 líneas. Recorta a lo
// accionable: TODAS las líneas de error/warning + la cola (donde suele morir
// el build), sin perder señal. Si el log ya es corto, se devuelve entero.
const ERROR_RE =
  /error|failed|fail|cannot|not found|unexpected|missing|ELIFECYCLE|ERR_|Module not found|Type error|exited with|throw|Unhandled/i
const TAIL_LINES = 120
const MAX_ERROR_LINES = 120

function trimBuildLog(log: string): { text: string; trimmed: boolean } {
  const lines = log.split("\n")
  if (lines.length <= TAIL_LINES + MAX_ERROR_LINES) {
    return { text: log, trimmed: false }
  }
  const tailStart = lines.length - TAIL_LINES
  const errorLines: string[] = []
  for (let i = 0; i < tailStart; i++) {
    if (ERROR_RE.test(lines[i])) {
      errorLines.push(`${i + 1}: ${lines[i]}`)
      if (errorLines.length >= MAX_ERROR_LINES) break
    }
  }
  const tail = lines.slice(tailStart)
  const parts: string[] = []
  if (errorLines.length > 0) {
    parts.push(
      `— Líneas de ERROR/WARNING (de las primeras ${tailStart}) —`,
      ...errorLines,
      "",
    )
  }
  parts.push(`— Últimas ${TAIL_LINES} líneas del log —`, ...tail)
  return { text: parts.join("\n"), trimmed: true }
}

export default defineTool({
  description:
    "Lee el log de build del deployment en Vercel del sitio (autenticado con VERCEL_TOKEN). Úsalo para diagnosticar por qué falló un build o deployment — NUNCA intentes leer logs de Vercel/GitHub con web_fetch: esas páginas requieren sesión y devuelven 403/404.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    commitSha: z
      .string()
      .min(7)
      .optional()
      .describe(
        "SHA del commit cuyo deployment quieres inspeccionar; sin él se usa el deployment más reciente del proyecto.",
      ),
  }),
  async execute({ siteId, commitSha }) {
    const site = await getSite(siteId)
    if (!site.vercel_project_id) {
      throw new Error(
        "El site no tiene vercel_project_id; no hay deployments que inspeccionar.",
      )
    }
    const deployment = await getLatestDeployment({
      projectId: site.vercel_project_id,
      commitSha,
    })
    if (!deployment?.uid) {
      return {
        state: null,
        log: null,
        hint: "El proyecto no tiene deployments todavía (¿el push llegó a GitHub? ¿la GitHub App de Vercel está instalada en la org?).",
      }
    }
    const rawLog = await getDeploymentBuildLog({ deploymentUid: deployment.uid })
    if (!rawLog) {
      return {
        state: deployment.state,
        url: deployment.url,
        log: "(el deployment no emitió log de build)",
      }
    }
    const { text, trimmed } = trimBuildLog(rawLog)
    return {
      state: deployment.state,
      url: deployment.url,
      log: text,
      ...(trimmed
        ? {
            note: "Log RECORTADO a errores/warnings + cola (el completo eran miles de líneas). Si el error real no está aquí, vuelve a llamar con el commitSha exacto o pide el log completo.",
          }
        : {}),
    }
  },
})
