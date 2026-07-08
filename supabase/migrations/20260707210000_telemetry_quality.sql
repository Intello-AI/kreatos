-- Telemetría de CALIDAD para cerrar el A/B (2026-07-07). Sin esto, build_summary
-- solo dice costo/tiempo → elegirías el modelo más barato aunque haga sitios
-- PEORES. review_screenshots ahora manda su veredicto a tool_timing (approved,
-- pass, critical/major) → aquí lo unimos por build y por modelo.
--   * build_summary          — + review_rounds, approved, issues, codegen_model.
--   * build_cost_by_model    — + calidad por ORQUESTADOR (review_rounds, approved%).
--   * build_quality_by_codegen — el A/B de codegen (GLM vs deepseek): calidad +
--       latencia + costo agrupado por el modelo que ESCRIBE los componentes.
-- OJO: las columnas de tool_timing solo se pueblan para builds NUEVOS (tras el
-- REDEPLOY de kreatos-agent). En histórico salen 0/NULL; costo/wall/pasos/modelo
-- dominante sí funcionan desde ya.

-- DROP primero: `create or replace view` no permite reordenar/insertar columnas
-- (build_summary gana codegen_model en medio). Se recrean las 3 en orden de
-- dependencia (dependientes primero).
drop view if exists public.build_quality_by_codegen;
drop view if exists public.build_cost_by_model;
drop view if exists public.build_summary;

create view public.build_summary as
with tu as (
  select
    session_id,
    min(created_at) as started_at,
    max(created_at) as ended_at,
    count(*) filter (where turn_id is not null) as steps,
    sum(input_tokens) as input_tokens,
    sum(output_tokens) as output_tokens,
    sum(cache_read_tokens) as cache_read_tokens
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
      + t.output_tokens::numeric / 1e6 * coalesce(p.output_per_1m, 0)
    ) as cost_usd
  from public.token_usage t
  left join public.model_pricing p on p.model = t.model
  where t.agent = 'site-builder'
  group by t.session_id
),
dom as (
  select distinct on (session_id) session_id, model as dominant_model
  from (
    select session_id, model, sum(input_tokens) as inp
    from public.token_usage where agent = 'site-builder'
    group by session_id, model
  ) x
  order by session_id, inp desc
),
cg as (  -- modelo que ESCRIBE los componentes (draft_section)
  select distinct on (session_id) session_id, meta->>'model' as codegen_model
  from public.tool_timing
  where tool = 'draft_section' and meta ? 'model'
  order by session_id, created_at desc
),
cycles as (
  select session_id, count(*) as build_cycles
  from public.tool_timing where tool = 'build_check' group by session_id
),
build_ms as (
  select
    session_id,
    percentile_cont(0.5) within group (order by (meta->'rungMs'->>'build')::numeric) as build_ms_p50,
    sum((meta->'rungMs'->>'build')::numeric) as build_ms_total
  from public.tool_timing
  where tool = 'build_check' and (meta->'rungMs') ? 'build'
  group by session_id
),
sections as (
  select
    session_id,
    count(*) as draft_sections,
    percentile_cont(0.5) within group (order by duration_ms) as draft_section_ms_p50,
    count(*) filter (where (meta->>'retried')::boolean) as draft_section_retries
  from public.tool_timing where tool = 'draft_section' group by session_id
),
reviews as (  -- el ÚLTIMO review (max pass) por build = veredicto final de calidad
  select distinct on (session_id)
    session_id,
    (meta->>'pass')::int as review_rounds,
    ok as approved_final,
    (meta->>'critical')::int as critical_issues,
    (meta->>'major')::int as major_issues
  from public.tool_timing
  where tool = 'review_screenshots'
  order by session_id, (meta->>'pass')::int desc
)
select
  tu.session_id,
  sc.site_id,
  tu.started_at,
  tu.ended_at,
  round(extract(epoch from (tu.ended_at - tu.started_at)) / 60.0, 1) as wall_min,
  tu.steps,
  dom.dominant_model,
  cg.codegen_model,
  round(cost.cost_usd, 2) as cost_usd,
  round(100.0 * tu.cache_read_tokens / nullif(tu.input_tokens, 0), 1) as cache_read_pct,
  coalesce(cy.build_cycles, 0) as build_cycles,
  round(bm.build_ms_p50) as build_ms_p50,
  round(bm.build_ms_total) as build_ms_total,
  coalesce(se.draft_sections, 0) as draft_sections,
  round(se.draft_section_ms_p50) as draft_section_ms_p50,
  coalesce(se.draft_section_retries, 0) as draft_section_retries,
  coalesce(rv.review_rounds, 0) as review_rounds,
  rv.approved_final,
  coalesce(rv.critical_issues, 0) as critical_issues,
  coalesce(rv.major_issues, 0) as major_issues
from tu
left join cost on cost.session_id = tu.session_id
left join dom on dom.session_id = tu.session_id
left join cg on cg.session_id = tu.session_id
left join cycles cy on cy.session_id = tu.session_id
left join build_ms bm on bm.session_id = tu.session_id
left join sections se on se.session_id = tu.session_id
left join reviews rv on rv.session_id = tu.session_id
left join public.session_context sc on sc.session_id = tu.session_id
order by tu.started_at desc;

-- A/B del ORQUESTADOR: costo + wall + CALIDAD por modelo dominante.
create or replace view public.build_cost_by_model as
select
  dominant_model,
  count(*) as builds,
  round(percentile_cont(0.5) within group (order by cost_usd)::numeric, 2) as cost_usd_p50,
  round(percentile_cont(0.5) within group (order by wall_min)::numeric, 1) as wall_min_p50,
  round(percentile_cont(0.5) within group (order by steps)::numeric) as steps_p50,
  round(percentile_cont(0.5) within group (order by build_cycles)::numeric) as build_cycles_p50,
  round(percentile_cont(0.5) within group (order by review_rounds)::numeric, 1) as review_rounds_p50,
  round(100.0 * count(*) filter (where approved_final) / nullif(count(*) filter (where approved_final is not null), 0), 0) as approved_pct
from public.build_summary
where steps >= 20
group by dominant_model
order by cost_usd_p50;

-- A/B del CODEGEN (GLM vs deepseek): el modelo que escribe los componentes. La
-- calidad se ve en review_rounds (menos = mejor a la primera) y approved_pct.
create or replace view public.build_quality_by_codegen as
select
  codegen_model,
  count(*) as builds,
  round(percentile_cont(0.5) within group (order by review_rounds)::numeric, 1) as review_rounds_p50,
  round(100.0 * count(*) filter (where approved_final) / nullif(count(*) filter (where approved_final is not null), 0), 0) as approved_pct,
  round(percentile_cont(0.5) within group (order by draft_section_ms_p50)::numeric) as section_ms_p50,
  round(percentile_cont(0.5) within group (order by draft_section_retries)::numeric, 1) as section_retries_p50,
  round(percentile_cont(0.5) within group (order by cost_usd)::numeric, 2) as cost_usd_p50
from public.build_summary
where codegen_model is not null and steps >= 20
group by codegen_model
order by review_rounds_p50;

comment on view public.build_quality_by_codegen is
  'A/B del modelo de codegen (draft_section): calidad (review_rounds, approved%), latencia y costo por modelo que escribe los componentes. GLM vs deepseek vs sonnet.';
