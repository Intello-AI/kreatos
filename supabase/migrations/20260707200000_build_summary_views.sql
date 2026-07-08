-- Vistas de lectura para el plan de eficiencia (Fase 0). Leen token_usage +
-- tool_calls + tool_timing + model_pricing + session_context.
--   * build_summary       — una fila por build (sesión del site-builder):
--       costo, wall, pasos, modelo dominante, ciclos build-repair, ms de `pnpm
--       build`, latencia de draft_section.
--   * build_cost_by_model — rollup por modelo dominante (Sonnet vs gpt-5.4 vs
--       deepseek…): el A/B que dice si el flip del orquestador pagó.
-- NOTA: las columnas de tool_timing (build_cycles/build_ms/draft_section_*) solo
-- se pueblan para builds NUEVOS (instrumentación 2026-07-07); en builds viejos
-- salen 0/NULL. Costo/wall/pasos/modelo SÍ funcionan sobre el histórico.

-- Costo por sesión: input_tokens YA incluye el cacheado (criterio de la vista
-- cache_health), así que fresh = input - cache_read a precio de input; el
-- cacheado a precio de cache; output a precio de output.
create or replace view public.build_summary as
with tu as (
  select
    session_id,
    min(created_at)                                         as started_at,
    max(created_at)                                         as ended_at,
    count(*) filter (where turn_id is not null)             as steps,
    sum(input_tokens)                                       as input_tokens,
    sum(output_tokens)                                      as output_tokens,
    sum(cache_read_tokens)                                  as cache_read_tokens
  from public.token_usage
  where agent = 'site-builder'
  group by session_id
),
cost as (
  select
    t.session_id,
    sum(
      (t.input_tokens - t.cache_read_tokens)::numeric / 1e6 * coalesce(p.input_per_1m, 0)
      + t.cache_read_tokens::numeric / 1e6 * coalesce(p.cache_read_per_1m, 0)
      + t.output_tokens::numeric  / 1e6 * coalesce(p.output_per_1m, 0)
    ) as cost_usd
  from public.token_usage t
  left join public.model_pricing p on p.model = t.model
  where t.agent = 'site-builder'
  group by t.session_id
),
dom as (  -- modelo DOMINANTE = el de más input por sesión (= el orquestador)
  select distinct on (session_id) session_id, model as dominant_model
  from (
    select session_id, model, sum(input_tokens) as inp
    from public.token_usage
    where agent = 'site-builder'
    group by session_id, model
  ) x
  order by session_id, inp desc
),
cycles as (
  select session_id, count(*) as build_cycles
  from public.tool_timing
  where tool = 'build_check'
  group by session_id
),
build_ms as (  -- ms del rung `pnpm build` de cada build_check
  select
    session_id,
    percentile_cont(0.5) within group (order by (meta->'rungMs'->>'build')::numeric) as build_ms_p50,
    sum((meta->'rungMs'->>'build')::numeric)                                          as build_ms_total
  from public.tool_timing
  where tool = 'build_check' and (meta->'rungMs') ? 'build'
  group by session_id
),
sections as (
  select
    session_id,
    count(*)                                                             as draft_sections,
    percentile_cont(0.5) within group (order by duration_ms)             as draft_section_ms_p50,
    count(*) filter (where (meta->>'retried')::boolean)                  as draft_section_retries
  from public.tool_timing
  where tool = 'draft_section'
  group by session_id
)
select
  tu.session_id,
  sc.site_id,
  tu.started_at,
  tu.ended_at,
  round(extract(epoch from (tu.ended_at - tu.started_at)) / 60.0, 1) as wall_min,
  tu.steps,
  dom.dominant_model,
  round(cost.cost_usd, 2)                                            as cost_usd,
  round(100.0 * tu.cache_read_tokens / nullif(tu.input_tokens, 0), 1) as cache_read_pct,
  coalesce(cy.build_cycles, 0)                                       as build_cycles,
  round(bm.build_ms_p50)                                             as build_ms_p50,
  round(bm.build_ms_total)                                           as build_ms_total,
  coalesce(se.draft_sections, 0)                                     as draft_sections,
  round(se.draft_section_ms_p50)                                     as draft_section_ms_p50,
  coalesce(se.draft_section_retries, 0)                              as draft_section_retries
from tu
left join cost      on cost.session_id = tu.session_id
left join dom       on dom.session_id  = tu.session_id
left join cycles cy on cy.session_id   = tu.session_id
left join build_ms bm on bm.session_id = tu.session_id
left join sections se on se.session_id = tu.session_id
left join public.session_context sc on sc.session_id = tu.session_id
order by tu.started_at desc;

-- Rollup del A/B: agrupa builds por modelo dominante. Excluye corridas cortas
-- (probe/edit) con < 20 pasos para que la mediana refleje builds reales.
create or replace view public.build_cost_by_model as
select
  dominant_model,
  count(*)                                                                 as builds,
  round(percentile_cont(0.5) within group (order by cost_usd)::numeric, 2) as cost_usd_p50,
  round(percentile_cont(0.5) within group (order by wall_min)::numeric, 1) as wall_min_p50,
  round(percentile_cont(0.5) within group (order by steps)::numeric)       as steps_p50,
  round(percentile_cont(0.5) within group (order by build_cycles)::numeric) as build_cycles_p50
from public.build_summary
where steps >= 20
group by dominant_model
order by cost_usd_p50;

comment on view public.build_summary is
  'Una fila por build del site-builder: costo, wall, pasos, modelo dominante, ciclos build-repair, ms de pnpm build y latencia de draft_section (Fase 0 eficiencia 2026-07-07).';
comment on view public.build_cost_by_model is
  'Rollup del A/B de orquestador: mediana de costo/wall/pasos/ciclos por modelo dominante. Dice si el flip Sonnet→gpt-5.4 pagó.';
