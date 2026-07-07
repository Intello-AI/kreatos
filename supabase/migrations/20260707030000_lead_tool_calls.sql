-- Desglose de tool-calls por lead / subagente / tool, para el panel de costo.
-- Mismo criterio de atribución que lead_cost_by_stage (sesión -> site/lead vía
-- session_context). Da CONTEO de llamadas por tool dentro de cada subagente:
-- revela qué tools se llevan los steps mecánicos (bash/screenshot vs edit_file
-- vs run_visual_qa). token_usage NO tiene el tool por step, por eso son counts,
-- no tokens; el costo por modelo ya vive en lead_cost_by_stage.
create or replace view public.lead_tool_calls as
select
  coalesce(sc.lead_id, s.lead_id) as lead_id,
  tc.agent,
  tc.tool_name,
  count(*) as calls
from public.tool_calls tc
join public.session_context sc on sc.session_id = tc.session_id
left join public.sites s on s.id = sc.site_id
where coalesce(sc.lead_id, s.lead_id) is not null
group by coalesce(sc.lead_id, s.lead_id), tc.agent, tc.tool_name;
