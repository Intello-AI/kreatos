-- Atribución de STEPS a TOOLS. token_usage mide tokens por step pero NO qué
-- tool corrió en cada step, así que no se sabe QUÉ steps son la "grasa"
-- mecánica (bash de QA/build vs edit_file vs draft_surface). Este log —una
-- fila por acción del evento actions.requested— lo revela: con él, un build
-- real dice exactamente cuántos round-trips se van en cada tool y cuáles
-- colapsar. Se llena desde makeUsageHook (hook actions.requested), best-effort.
create table if not exists public.tool_calls (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  agent text not null,
  tool_name text not null,     -- toolName de la acción (o el kind si no es tool-call)
  kind text not null default 'tool-call',
  step_index integer,
  created_at timestamptz not null default now()
);
create index if not exists tool_calls_session_idx on public.tool_calls (session_id);
create index if not exists tool_calls_created_idx on public.tool_calls (created_at);

-- Distribución de tool-calls por sitio: el desglose que dice dónde colapsar.
create or replace view public.site_tool_calls as
select
  coalesce(sc.site_id, s.lead_id) as scope_id,
  sc.site_id,
  tc.agent,
  tc.tool_name,
  count(*) as calls
from public.tool_calls tc
join public.session_context sc on sc.session_id = tc.session_id
left join public.sites s on s.id = sc.site_id
group by coalesce(sc.site_id, s.lead_id), sc.site_id, tc.agent, tc.tool_name
order by count(*) desc;
