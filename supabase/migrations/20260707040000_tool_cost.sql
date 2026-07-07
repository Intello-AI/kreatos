-- Costo (tokens + USD) por tool dentro de cada subagente. token_usage mide por
-- STEP; tool_calls mide qué tool corrió en cada step. Uniéndolos por
-- (session, turn, step) se reparte el costo de cada step entre las tools que
-- invocó (la mayoría de steps invocan 1 tool → recibe el costo completo de esa
-- vuelta; si invoca N, se divide entre N). Así la tabla de usage puede mostrar
-- "bash: 72 llamadas, 5.8M tokens, $5.76" dentro de la fila del subagente.
-- Requiere las columnas de correlación (abajo); solo aplica a runs NUEVOS que
-- ya las graban — las filas históricas quedan sin step_index y se excluyen.
alter table public.token_usage add column if not exists step_index integer;
alter table public.tool_calls add column if not exists turn_id text;

create or replace view public.lead_tool_cost as
with step_tools as (
  -- Tools por step, con cuántas comparten ese step (para repartir su costo).
  select
    tc.session_id,
    tc.turn_id,
    tc.step_index,
    tc.agent,
    tc.tool_name,
    count(*) over (
      partition by tc.session_id, tc.turn_id, tc.step_index
    ) as tools_in_step
  from public.tool_calls tc
  where tc.step_index is not null and tc.turn_id is not null
),
step_cost as (
  -- Costo y tokens por step (token_usage = una fila por step.completed).
  select
    tu.session_id,
    tu.turn_id,
    tu.step_index,
    tu.input_tokens,
    tu.output_tokens,
    tu.cache_read_tokens,
    (greatest(tu.input_tokens - tu.cache_read_tokens, 0)::numeric / 1e6 * coalesce(mp.input_per_1m, 0))
      + (tu.cache_read_tokens::numeric / 1e6 * coalesce(mp.cache_read_per_1m, 0))
      + (tu.output_tokens::numeric / 1e6 * coalesce(mp.output_per_1m, 0)) as cost
  from public.token_usage tu
  left join public.model_pricing mp on mp.model = tu.model
  where tu.step_index is not null
)
select
  coalesce(sc.lead_id, s.lead_id) as lead_id,
  st.agent,
  st.tool_name,
  count(*) as calls,
  round(sum(scost.input_tokens::numeric / st.tools_in_step))::bigint as input_tokens,
  round(sum(scost.output_tokens::numeric / st.tools_in_step))::bigint as output_tokens,
  round(sum(scost.cache_read_tokens::numeric / st.tools_in_step))::bigint as cache_read_tokens,
  round(sum(scost.cost / st.tools_in_step), 4) as cost_usd
from step_tools st
join step_cost scost
  on scost.session_id = st.session_id
  and scost.turn_id = st.turn_id
  and scost.step_index = st.step_index
join public.session_context sc on sc.session_id = st.session_id
left join public.sites s on s.id = sc.site_id
where coalesce(sc.lead_id, s.lead_id) is not null
group by coalesce(sc.lead_id, s.lead_id), st.agent, st.tool_name;
