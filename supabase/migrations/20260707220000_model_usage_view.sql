-- Gasto por MODELO para la página de Analítica. Hoy el panel global desglosa
-- por AGENTE (lead_cost_by_stage sumado), no por modelo → GLM/DeepSeek/qwen no
-- aparecen en ningún lado global. Esta vista da una fila por modelo CONFIGURADO
-- (base = model_pricing, LEFT JOIN al uso) → cada modelo del catálogo aparece,
-- con $0 / 0 tokens si aún no se ha usado (p. ej. GLM antes de su primer build).
-- Costo con el mismo criterio que lead_cost_by_stage (input incluye el cacheado:
-- fresh a tarifa full, cacheado a tarifa cache).
create or replace view public.model_usage as
select
  p.model,
  coalesce(u.calls, 0)              as calls,
  coalesce(u.input_tokens, 0)       as input_tokens,
  coalesce(u.output_tokens, 0)      as output_tokens,
  coalesce(u.cache_read_tokens, 0)  as cache_read_tokens,
  round(coalesce(u.cost_usd, 0), 4) as cost_usd,
  u.last_used
from public.model_pricing p
left join (
  select
    t.model,
    count(*)                    as calls,
    sum(t.input_tokens)         as input_tokens,
    sum(t.output_tokens)        as output_tokens,
    sum(t.cache_read_tokens)    as cache_read_tokens,
    sum(
      (t.input_tokens - t.cache_read_tokens)::numeric / 1e6 * coalesce(pr.input_per_1m, 0)
      + t.cache_read_tokens::numeric / 1e6 * coalesce(pr.cache_read_per_1m, 0)
      + t.output_tokens::numeric / 1e6 * coalesce(pr.output_per_1m, 0)
    )                           as cost_usd,
    max(t.created_at)           as last_used
  from public.token_usage t
  left join public.model_pricing pr on pr.model = t.model
  group by t.model
) u on u.model = p.model
order by coalesce(u.cost_usd, 0) desc, p.model;

comment on view public.model_usage is
  'Gasto y tokens por modelo configurado (base model_pricing, LEFT JOIN token_usage). Todos los modelos aparecen; $0 si no se han usado. Para la tabla de usage por modelo en Analítica.';
