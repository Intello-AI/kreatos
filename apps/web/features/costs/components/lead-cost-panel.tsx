import { CaretRightIcon, CoinsIcon } from "@phosphor-icons/react/ssr"

import type { CostStage, LeadCost, ToolCostStat } from "@/features/costs/queries"
import { formatTokens, formatUsd } from "@/lib/format"
import { ClaudeAI, DeepSeek, GLM, OpenAI, Qwen } from "@/components/icons"

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

/** Icono del proveedor: Claude · Qwen · GLM (Z.ai) · DeepSeek · OpenAI (gpt/o). */
function ProviderIcon({ model }: { model: string }) {
  const m = model.toLowerCase()
  const isClaude = m.startsWith("claude")
  const isQwen = m.startsWith("qwen")
  const isGLM = m.startsWith("glm") || m.startsWith("zai")
  const isDeepSeek = m.startsWith("deepseek")
  const Logo = isClaude
    ? ClaudeAI
    : isQwen
      ? Qwen
      : isGLM
        ? GLM
        : isDeepSeek
          ? DeepSeek
          : OpenAI
  const label = isClaude
    ? "Anthropic"
    : isQwen
      ? "Qwen (Alibaba)"
      : isGLM
        ? "GLM (Z.ai)"
        : isDeepSeek
          ? "DeepSeek"
          : "OpenAI"
  return <Logo aria-label={label} className="size-3.5 shrink-0" />
}

interface AgentGroup {
  agent: string
  models: CostStage[]
  tools: ToolCostStat[]
  costUsd: number
  inputTokens: number
  outputTokens: number
  /** Costo de los steps con tool (suma del desglose). */
  toolCostSum: number
  /** Costo de los steps SIN tool (razonamiento / mensajes finales). */
  remainder: number
}

/** Agrupa stages (por modelo) y tools bajo cada subagente; orden por costo desc. */
function groupByAgent(
  stages: CostStage[],
  toolCalls: ToolCostStat[],
): AgentGroup[] {
  const agents = new Map<string, AgentGroup>()
  const ensure = (agent: string): AgentGroup => {
    let g = agents.get(agent)
    if (!g) {
      g = {
        agent,
        models: [],
        tools: [],
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        toolCostSum: 0,
        remainder: 0,
      }
      agents.set(agent, g)
    }
    return g
  }
  for (const s of stages) {
    const g = ensure(s.agent)
    g.models.push(s)
    g.costUsd += s.costUsd
    g.inputTokens += s.inputTokens
    g.outputTokens += s.outputTokens
  }
  for (const t of toolCalls) {
    const g = ensure(t.agent)
    g.tools.push(t)
    g.toolCostSum += t.costUsd
  }
  for (const g of agents.values()) {
    g.tools.sort((a, b) => b.costUsd - a.costUsd)
    g.remainder = Math.max(g.costUsd - g.toolCostSum, 0)
  }
  return [...agents.values()].sort((a, b) => b.costUsd - a.costUsd)
}

/**
 * Costo de IA de un lead/sitio: total en USD + desglose por subagente. Cada
 * subagente se expande a su desglose de MODELOS y de TOOLS (llamadas, tokens y
 * USD que representó cada una). Server component — recibe getLeadCost/getSiteCost.
 * "Estimado" porque parte de model_pricing (editable) y del cache_read.
 */
export function LeadCostPanel({ cost }: { cost: LeadCost }) {
  const { total, stages, toolCalls } = cost
  const groups = groupByAgent(stages, toolCalls)

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
            Estimado con la tarifa por modelo. Abre un subagente para ver el
            costo por herramienta.
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {formatUsd(total?.costUsd)}
        </p>
      </div>

      {!total || groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin registro de tokens todavía. Aparece en cuanto corre una etapa del
          pipeline para este lead.
        </p>
      ) : (
        <div className="divide-y border">
          {/* Cabecera de columnas */}
          <div className="flex items-center gap-2 bg-sidebar px-3 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
            <span className="flex-1">Subagente</span>
            <span className="w-28 text-right">Entrada · Salida</span>
            <span className="w-16 text-right">Costo</span>
          </div>
          {groups.map((g) => (
            <details key={g.agent} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs hover:bg-sidebar group-open:bg-sidebar/40 group-open:hover:bg-sidebar/40">
                <CaretRightIcon
                  aria-hidden
                  className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                />
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate font-medium">
                    {agentLabel(g.agent)}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {[...new Set(g.models.map((m) => m.model))].map((model) => (
                      <ProviderIcon key={model} model={model} />
                    ))}
                  </span>
                </span>
                <span className="w-28 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {formatTokens(g.inputTokens)} · {formatTokens(g.outputTokens)}
                </span>
                <span className="w-16 text-right font-medium tabular-nums">
                  {formatUsd(g.costUsd)}
                </span>
              </summary>

              <div className="space-y-2 bg-sidebar/40 px-3 pt-1 pb-2.5 pl-8 text-xs">
                {/* Modelos (solo si el subagente usó más de uno). */}
                {g.models.length > 1 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                      Modelos
                    </p>
                    {g.models.map((m) => (
                      <div
                        key={m.model}
                        className="flex items-center gap-2 text-muted-foreground"
                      >
                        <ProviderIcon model={m.model} />
                        <span className="truncate font-mono text-[11px]">
                          {m.model}
                        </span>
                        <span className="ml-auto w-16 text-right tabular-nums">
                          {formatUsd(m.costUsd)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Herramientas: llamadas + tokens + USD que representó cada una. */}
                <div className="space-y-1">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                    Herramientas
                  </p>
                  {g.tools.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/70">
                      Sin desglose por herramienta todavía — aparece cuando corre
                      un build con la instrumentación desplegada.
                    </p>
                  ) : (
                    <>
                      {g.tools.map((t) => (
                        <div
                          key={t.toolName}
                          className="flex items-center gap-2"
                        >
                          <span className="truncate font-mono text-[11px] text-muted-foreground">
                            {t.toolName}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
                            {t.calls}×
                          </span>
                          <span className="ml-auto w-20 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                            {formatTokens(t.inputTokens + t.outputTokens)}
                          </span>
                          <span className="w-16 text-right tabular-nums">
                            {formatUsd(t.costUsd)}
                          </span>
                        </div>
                      ))}
                      {g.remainder > 0.005 && (
                        <div className="flex items-center gap-2 text-muted-foreground/70">
                          <span className="truncate text-[11px] italic">
                            Razonamiento y mensajes (sin tool)
                          </span>
                          <span className="ml-auto w-16 text-right tabular-nums">
                            {formatUsd(g.remainder)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
