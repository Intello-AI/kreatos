-- Precio de qwen3.7-plus (Alibaba Model Studio, endpoint internacional), para
-- que el A/B de costo del site-builder (vistas lead_cost / tool_cost sobre
-- model_pricing) cuente el modelo qwen en vez de dejarlo en $0.
-- Fuente: qwencloud.com/models/qwen3.7-plus, consultada 2026-07-07. USD.
-- Lista estándar; hay promo -20% vigente (0.32/1.28/0.064) que NO fijamos aquí.
-- cache_read = cache IMPLÍCITO de Qwen (automático server-side, bloques de 2048
-- tok; reporta cached_tokens → nuestro hook lo graba en cache_read_tokens).
-- Verificado empírico: read=2048/call con prefijo estable ≥2048. OJO: qwen NO
-- recibe los breakpoints explícitos de Anthropic (la auto-cache de eve es
-- anthropic-only), así que su cobertura de cache es menor que el ~97% de Sonnet
-- — pero el input base ($0.40 vs $3.00) compensa. cache_read=0.08 = 0.2x input.
insert into public.model_pricing (model, input_per_1m, output_per_1m, cache_read_per_1m, note) values
  ('qwen3.7-plus', 0.40, 1.60, 0.08, 'qwencloud.com 2026-07-07 (lista; promo -20%: 0.32/1.28/0.064; cache implícito)')
on conflict (model) do update set
  input_per_1m      = excluded.input_per_1m,
  output_per_1m     = excluded.output_per_1m,
  cache_read_per_1m = excluded.cache_read_per_1m,
  note              = excluded.note;
