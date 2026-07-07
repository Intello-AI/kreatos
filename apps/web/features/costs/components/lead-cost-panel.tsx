import { CaretRightIcon, CoinsIcon } from "@phosphor-icons/react/ssr"

import type { LeadCost, ToolCallStat } from "@/features/costs/queries"
import { formatTokens, formatUsd } from "@/lib/format"
import { ClaudeAI, OpenAI } from "@/components/icons"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** Etiqueta legible por agente (las stages guardan el nombre técnico). */
const AGENT_LABELS: Record<string, string> = {
  "lead-finder": "Búsqueda de leads",
  "brand-curator": "Curador de marca",
  "art-director": "Dirección de arte",
  "site-builder": "Sitio (build · edit · publish)",
  // Key histórica: el costo de publicación de sitios anteriores al merge
  // builder+manager quedó atribuido a "site-manager"; se conserva el label.
  "site-manager": "Publicación",
  proposal: "Propuesta",
  outreach: "Contacto",
  commercial: "Orquestador",
}

function agentLabel(agent: string): string {
  return AGENT_LABELS[agent] ?? agent
}

/** Icono del proveedor del modelo: Claude (Anthropic) vs OpenAI (todo lo gpt/o). */
function ProviderIcon({ model }: { model: string }) {
  const isClaude = model.toLowerCase().startsWith("claude")
  const Logo = isClaude ? ClaudeAI : OpenAI
  return (
    <Logo
      aria-label={isClaude ? "Anthropic" : "OpenAI"}
      className="size-3.5 shrink-0"
    />
  )
}

/** Agrupa las tool-calls por subagente, orden por total desc. */
function toolsByAgent(
  toolCalls: ToolCallStat[],
): { agent: string; tools: ToolCallStat[]; total: number }[] {
  const map = new Map<string, ToolCallStat[]>()
  for (const tc of toolCalls) {
    const arr = map.get(tc.agent) ?? []
    arr.push(tc)
    map.set(tc.agent, arr)
  }
  return [...map.entries()]
    .map(([agent, tools]) => ({
      agent,
      tools: [...tools].sort((a, b) => b.calls - a.calls),
      total: tools.reduce((sum, t) => sum + t.calls, 0),
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Costo de IA de un lead/sitio: total en USD + desglose por etapa y modelo,
 * más el desglose de llamadas por tool DENTRO de cada subagente (tabla
 * tool_calls). Server component — recibe el resultado de getLeadCost/getSiteCost.
 * "Estimado" porque parte de model_pricing (editable) y del cache_read.
 */
export function LeadCostPanel({ cost }: { cost: LeadCost }) {
  const { total, stages, toolCalls } = cost
  const toolGroups = toolsByAgent(toolCalls)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <CoinsIcon className="size-4 text-muted-foreground" />
            Costo de IA
          </h2>
          <p className="text-xs text-muted-foreground">
            Tokens gastados desde la búsqueda del lead hasta vender el sitio.
            Estimado con la tarifa por modelo.
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {formatUsd(total?.costUsd)}
        </p>
      </div>

      {!total || stages.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin registro de tokens todavía. Aparece en cuanto corre una etapa del
          pipeline para este lead.
        </p>
      ) : (
        <div className="overflow-x-auto border">
          <Table>
            <TableHeader className="bg-sidebar">
              <TableRow className="divide-x">
                <TableHead>Etapa</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Entrada</TableHead>
                <TableHead className="text-right">Salida</TableHead>
                <TableHead className="text-right">Costo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((s) => (
                <TableRow key={`${s.agent}-${s.model}`}>
                  <TableCell className="font-medium">
                    {agentLabel(s.agent)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ProviderIcon model={s.model} />
                      {s.model}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatTokens(s.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatTokens(s.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsd(s.costUsd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {toolGroups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Llamadas por herramienta
          </p>
          <div className="divide-y border">
            {toolGroups.map(({ agent, tools, total: agentTotal }) => (
              <details key={agent} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-sidebar">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CaretRightIcon className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    {agentLabel(agent)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {agentTotal} llamadas · {tools.length}{" "}
                    {tools.length === 1 ? "tool" : "tools"}
                  </span>
                </summary>
                <div className="divide-y bg-sidebar/40">
                  {tools.map((t) => (
                    <div
                      key={t.toolName}
                      className="flex items-center justify-between gap-2 py-1.5 pr-3 pl-8 text-xs"
                    >
                      <span className="truncate font-mono text-muted-foreground">
                        {t.toolName}
                      </span>
                      <span className="shrink-0 tabular-nums">{t.calls}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
