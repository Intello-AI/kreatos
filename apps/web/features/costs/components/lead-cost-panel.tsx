import { CoinsIcon } from "@phosphor-icons/react/ssr"

import type { LeadCost } from "@/features/costs/queries"
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
  "site-builder": "Construcción del sitio",
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

/**
 * Costo de IA de un lead/sitio: total en USD + desglose por etapa y modelo.
 * Server component — recibe el resultado de getLeadCost/getSiteCost.
 * "Estimado" porque parte de model_pricing (editable) y del cache_read.
 */
export function LeadCostPanel({ cost }: { cost: LeadCost }) {
  const { total, stages } = cost

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
    </div>
  )
}
