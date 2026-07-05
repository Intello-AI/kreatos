-- Precios de modelos VERIFICADOS contra la doc oficial de OpenAI
-- (developers.openai.com/api/docs/models/<id>, consultada 2026-07-05).
-- Los valores de OpenAI ya eran correctos; esto solo confirma la fuente en el
-- `note` (antes decía "ESTIMADO — ajustar", engañoso) y agrega gpt-5.5.
-- Cache = 10% del input en toda la serie GPT-5 (patrón OpenAI, verificado).
insert into public.model_pricing (model, input_per_1m, output_per_1m, cache_read_per_1m, note) values
  ('gpt-5.5',         5.00, 30.00, 0.50,  'OpenAI docs 2026-07-05 (cache=10% input, derivado)'),
  ('gpt-5.4',         2.50, 15.00, 0.25,  'OpenAI docs 2026-07-05'),
  ('gpt-5.4-mini',    0.75,  4.50, 0.075, 'OpenAI docs 2026-07-05'),
  ('gpt-5.1',         1.25, 10.00, 0.125, 'OpenAI docs 2026-07-05'),
  ('gpt-5-mini',      0.25,  2.00, 0.025, 'OpenAI docs 2026-07-05'),
  ('gpt-5-nano',      0.05,  0.40, 0.005, 'OpenAI docs 2026-07-05'),
  ('claude-sonnet-5', 3.00, 15.00, 0.30,  'Anthropic (Sonnet) — no en doc OpenAI; tarifa estándar Sonnet, verificar en factura')
on conflict (model) do update set
  input_per_1m      = excluded.input_per_1m,
  output_per_1m     = excluded.output_per_1m,
  cache_read_per_1m = excluded.cache_read_per_1m,
  note              = excluded.note;
