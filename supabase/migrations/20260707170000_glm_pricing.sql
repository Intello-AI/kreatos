-- Precio de zai/glm-5.2 (Z.ai, servido vía Vercel AI Gateway), para que el A/B
-- de costo del site-builder (vistas lead_cost / tool_cost sobre model_pricing)
-- cuente el modelo GLM en vez de dejarlo en $0.
-- Fuente: docs.z.ai/guides/overview/pricing + vercel.com/ai-gateway/models/glm-5.2,
-- consultadas 2026-07-07. USD, tarifa first-party de Z.ai (= ruteo default del
-- gateway). OJO: el gateway puede rutear a proveedores más baratos (Novita /
-- OpenRouter ~$0.9 in) si se fija provider; si se hace, ajusta aquí.
-- cache_read = cache IMPLÍCITO de Z.ai (el endpoint reporta cached_tokens →
-- nuestro hook lo graba en cache_read_tokens). GLM NO recibe los breakpoints
-- explícitos de Anthropic (la auto-cache de eve es anthropic-only), así que su
-- cobertura de cache es menor que el ~97% de Sonnet — pero el input base
-- ($1.40 vs $3.00) compensa. cache_read=0.26 = 0.19x input.
insert into public.model_pricing (model, input_per_1m, output_per_1m, cache_read_per_1m, note) values
  ('glm-5.2', 1.40, 4.40, 0.26, 'Z.ai/Vercel AI Gateway 2026-07-07 (first-party; gateway puede rutear más barato; cache implícito, verificar en factura)')
on conflict (model) do update set
  input_per_1m      = excluded.input_per_1m,
  output_per_1m     = excluded.output_per_1m,
  cache_read_per_1m = excluded.cache_read_per_1m,
  note              = excluded.note;
