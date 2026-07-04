import { defineTool } from "eve/tools"
import { z } from "zod"

import { saveQaReport } from "../lib/sites"

export default defineTool({
  description:
    "Guarda el qa-report.json (salida de `pnpm qa` del template) en la versión correspondiente de site_versions. Corre esto después del QA y antes del push.",
  inputSchema: z.object({
    siteId: z.string().uuid(),
    versionN: z.number().int().min(1),
    qaReport: z
      .record(z.string(), z.unknown())
      .describe("Contenido de .qa/qa-report.json leído del sandbox."),
  }),
  async execute({ siteId, versionN, qaReport }) {
    await saveQaReport({ siteId, versionN, qaReport })
    return { saved: true }
  },
})
