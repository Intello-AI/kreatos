import { getAdminClient } from "@/lib/supabase/admin"

/**
 * Costo de IA por lead. Se alimenta de las vistas SQL:
 *  - lead_cost_total: una fila por lead con el costo agregado (USD).
 *  - lead_cost_by_stage: desglose por etapa (agente) y modelo.
 * El costo se calcula con model_pricing (USD por 1M de tokens). Todo server-only.
 */

export interface CostTotal {
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
}

export interface CostStage extends CostTotal {
  agent: string
  model: string
}

/** Conteo de llamadas de una tool dentro de un subagente (tabla tool_calls). */
export interface ToolCallStat {
  agent: string
  toolName: string
  calls: number
}

export interface LeadCost {
  total: CostTotal | null
  stages: CostStage[]
  /** Desglose por tool dentro de cada subagente (counts, no tokens). */
  toolCalls: ToolCallStat[]
}

const ZERO: CostTotal = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
}

/** Costo total + desglose por etapa de un lead. */
export async function getLeadCost(leadId: string): Promise<LeadCost> {
  const supabase = getAdminClient()
  const [{ data: totalRow }, { data: stageRows }, { data: toolRows }] =
    await Promise.all([
      supabase
        .from("lead_cost_total")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle(),
      supabase
        .from("lead_cost_by_stage")
        .select("*")
        .eq("lead_id", leadId)
        .order("cost_usd", { ascending: false }),
      supabase
        .from("lead_tool_calls")
        .select("*")
        .eq("lead_id", leadId)
        .order("calls", { ascending: false }),
    ])

  const total: CostTotal | null = totalRow
    ? {
        costUsd: totalRow.cost_usd ?? 0,
        inputTokens: totalRow.input_tokens ?? 0,
        outputTokens: totalRow.output_tokens ?? 0,
        cacheReadTokens: totalRow.cache_read_tokens ?? 0,
      }
    : null

  const stages: CostStage[] = (stageRows ?? []).map((r) => ({
    agent: r.agent ?? "—",
    model: r.model ?? "—",
    costUsd: r.cost_usd ?? 0,
    inputTokens: r.input_tokens ?? 0,
    outputTokens: r.output_tokens ?? 0,
    cacheReadTokens: r.cache_read_tokens ?? 0,
  }))

  const toolCalls: ToolCallStat[] = (toolRows ?? []).map((r) => ({
    agent: r.agent ?? "—",
    toolName: r.tool_name ?? "—",
    calls: Number(r.calls ?? 0),
  }))

  return { total, stages, toolCalls }
}

/** Mapa lead_id → costo USD, para pintar la columna Costo en la tabla de leads. */
export async function getLeadCostMap(
  leadIds: string[],
): Promise<Record<string, number>> {
  if (leadIds.length === 0) return {}
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("lead_cost_total")
    .select("lead_id, cost_usd")
    .in("lead_id", leadIds)

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    if (row.lead_id) map[row.lead_id] = row.cost_usd ?? 0
  }
  return map
}

/** Costo de IA de un sitio: se resuelve al lead dueño y se reusa getLeadCost. */
export async function getSiteCost(siteId: string): Promise<LeadCost> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("sites")
    .select("lead_id")
    .eq("id", siteId)
    .maybeSingle()
  if (!data?.lead_id) return { total: null, stages: [], toolCalls: [] }
  return getLeadCost(data.lead_id)
}

export interface CostOverview {
  /** Costo total atribuido a leads (suma de lead_cost_total). */
  total: CostTotal
  /** Desglose por etapa (agente) sumado sobre todos los leads. */
  byStage: { agent: string; costUsd: number }[]
  /** Serie diaria de gasto de IA (últimos 30 días, TODO el uso, no solo leads). */
  series: { date: string; cost: number }[]
  error: string | null
}

/** Panorama de costo para la página de Analítica. */
export async function getCostOverview(): Promise<CostOverview> {
  const supabase = getAdminClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const [{ data: totals }, { data: stages }, { data: pricing }, { data: usage, error }] =
    await Promise.all([
      supabase.from("lead_cost_total").select("*"),
      supabase.from("lead_cost_by_stage").select("agent, cost_usd"),
      supabase.from("model_pricing").select("*"),
      supabase
        .from("token_usage")
        .select("created_at, model, input_tokens, output_tokens, cache_read_tokens")
        .gte("created_at", since),
    ])

  const total = (totals ?? []).reduce<CostTotal>(
    (acc, r) => ({
      costUsd: acc.costUsd + (r.cost_usd ?? 0),
      inputTokens: acc.inputTokens + (r.input_tokens ?? 0),
      outputTokens: acc.outputTokens + (r.output_tokens ?? 0),
      cacheReadTokens: acc.cacheReadTokens + (r.cache_read_tokens ?? 0),
    }),
    { ...ZERO },
  )

  // by-stage: suma cost_usd por agente
  const stageMap = new Map<string, number>()
  for (const r of stages ?? []) {
    const key = r.agent ?? "—"
    stageMap.set(key, (stageMap.get(key) ?? 0) + (r.cost_usd ?? 0))
  }
  const byStage = [...stageMap.entries()]
    .map(([agent, costUsd]) => ({ agent, costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd)

  // serie diaria: costo por fila de token_usage vía model_pricing
  const price = new Map(
    (pricing ?? []).map((p) => [
      p.model,
      {
        i: p.input_per_1m ?? 0,
        o: p.output_per_1m ?? 0,
        c: p.cache_read_per_1m ?? 0,
      },
    ]),
  )
  const dayMap = new Map<string, number>()
  for (const u of usage ?? []) {
    const p = price.get(u.model)
    if (!p) continue
    // input_tokens incluye los cached → cobra solo el excedente a tarifa full,
    // y los cached a tarifa cache (igual que la vista lead_cost_by_stage).
    const cached = u.cache_read_tokens ?? 0
    const fullInput = Math.max((u.input_tokens ?? 0) - cached, 0)
    const cost =
      (fullInput / 1e6) * p.i +
      (cached / 1e6) * p.c +
      ((u.output_tokens ?? 0) / 1e6) * p.o
    const day = (u.created_at ?? "").slice(0, 10)
    if (!day) continue
    dayMap.set(day, (dayMap.get(day) ?? 0) + cost)
  }
  // rellena los 30 días para que la línea no tenga huecos
  const series: { date: string; cost: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    series.push({ date: d, cost: Number((dayMap.get(d) ?? 0).toFixed(4)) })
  }

  return { total, byStage, series, error: error?.message ?? null }
}
