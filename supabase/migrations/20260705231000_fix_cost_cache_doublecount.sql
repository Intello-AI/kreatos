-- Corrige sobreconteo de costo: input_tokens (de la AI SDK) YA INCLUYE los
-- cached, así que cobrar input completo + cache aparte contaba los cached dos
-- veces (a tarifa full + a tarifa cache). El costo real de OpenAI es:
--   (input - cache) a tarifa full  +  cache a tarifa cache  +  output.
create or replace view public.lead_cost_by_stage as
select
  coalesce(sc.lead_id, s.lead_id) as lead_id,
  tu.agent,
  tu.model,
  sum(tu.input_tokens) as input_tokens,
  sum(tu.output_tokens) as output_tokens,
  sum(tu.cache_read_tokens) as cache_read_tokens,
  round(
    (greatest(sum(tu.input_tokens) - sum(tu.cache_read_tokens), 0)::numeric / 1e6 * coalesce(mp.input_per_1m, 0))
    + (sum(tu.cache_read_tokens)::numeric / 1e6 * coalesce(mp.cache_read_per_1m, 0))
    + (sum(tu.output_tokens)::numeric / 1e6 * coalesce(mp.output_per_1m, 0)),
    4
  ) as cost_usd
from public.token_usage tu
join public.session_context sc on sc.session_id = tu.session_id
left join public.sites s on s.id = sc.site_id
left join public.model_pricing mp on mp.model = tu.model
where coalesce(sc.lead_id, s.lead_id) is not null
group by coalesce(sc.lead_id, s.lead_id), tu.agent, tu.model,
         mp.input_per_1m, mp.output_per_1m, mp.cache_read_per_1m;

-- lead_cost_total suma by_stage; se recrea por si el planner cacheó la anterior.
create or replace view public.lead_cost_total as
select
  lead_id,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(cache_read_tokens) as cache_read_tokens,
  round(sum(cost_usd), 4) as cost_usd
from public.lead_cost_by_stage
group by lead_id;
