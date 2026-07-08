-- Precio de deepseek-v4-pro (DeepSeek, API DIRECTA vía provider nativo
-- @ai-sdk/deepseek — NO gateway), para que el A/B de costo del site-builder
-- (vistas lead_cost / tool_cost sobre model_pricing) cuente el modelo DeepSeek
-- en vez de dejarlo en $0.
-- Fuente: precio oficial DeepSeek (cache-miss $0.435 / cached $0.003625 / output
-- $0.87), consultada 2026-07-07. USD. El "precio original" de referencia es 4x
-- ($1.74 in / $3.48 out); estos son los vigentes tras el descuento permanente.
-- cache_read = cache IMPLÍCITO de DeepSeek (automático server-side; el endpoint
-- reporta cached_tokens → nuestro hook lo graba en cache_read_tokens). NOTA: es
-- EXTREMO — $0.003625 = 0.008x del input (vs 0.1x de Sonnet/GPT), el gran
-- atractivo de costo. DeepSeek NO recibe los breakpoints explícitos de Anthropic
-- (auto-cache de eve = anthropic-only); depende del cache implícito del endpoint.
insert into public.model_pricing (model, input_per_1m, output_per_1m, cache_read_per_1m, note) values
  ('deepseek-v4-pro', 0.435, 0.87, 0.003625, 'DeepSeek API directa 2026-07-07 (precio con descuento permanente; original 4x; cache implícito extremo; verificar en factura)')
on conflict (model) do update set
  input_per_1m      = excluded.input_per_1m,
  output_per_1m     = excluded.output_per_1m,
  cache_read_per_1m = excluded.cache_read_per_1m,
  note              = excluded.note;
