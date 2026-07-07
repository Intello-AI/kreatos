-- cache_health: red de seguridad contra regresión silenciosa del prompt
-- caching. eve activa el cache de Anthropic automáticamente para site-builder
-- (Sonnet) y debería servir ~97% del input desde cache (0.1x del precio). Un
-- upgrade de eve, un dato volátil metido al inicio del system prompt, o
-- reordenar el registro de tools a media sesión tumba el hit-rate y multiplica
-- x10 el costo de input — sin error visible. Esta vista lo hace medible.
--
-- Uso: `select * from cache_health where cache_read_pct < 90 and calls > 5;`
-- Alertar si site-builder/claude-sonnet-5 baja de ~90%.
create or replace view public.cache_health as
select
  tu.agent,
  tu.model,
  count(*) as calls,
  sum(tu.input_tokens) as input_tokens,
  sum(tu.cache_read_tokens) as cache_read_tokens,
  -- % del input servido desde cache. input_tokens (de la AI SDK) YA incluye los
  -- cacheados, así que cache_read/input es directamente el hit-rate.
  round(
    100.0 * sum(tu.cache_read_tokens) / nullif(sum(tu.input_tokens), 0),
    1
  ) as cache_read_pct,
  min(tu.created_at) as first_seen,
  max(tu.created_at) as last_seen
from public.token_usage tu
where tu.created_at >= now() - interval '7 days'
group by tu.agent, tu.model
order by sum(tu.input_tokens) desc;

comment on view public.cache_health is
  'Hit-rate de prompt caching por agente+modelo (últimos 7 días). Vigila que site-builder/claude-sonnet-5 se mantenga ~90%+; una caída = regresión del prefijo cacheable (ver INVARIANTE DE PROMPT CACHING en site-builder/agent.ts).';
