-- Tracking de tokens/costo por lead, por etapa (agente) y modelo.
-- token_usage: una fila por step.completed (cada llamada al modelo).
create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  turn_id text,
  agent text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists token_usage_session_idx on public.token_usage (session_id);
create index if not exists token_usage_created_idx on public.token_usage (created_at);

-- session_context: mapea una sesión de subagente a su lead/site, parseado del
-- tag [Contexto: lead X / site Y] del mensaje de delegación.
create table if not exists public.session_context (
  session_id text primary key,
  lead_id uuid references public.leads(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Precios por modelo (USD por 1M tokens). EDITABLE: ajusta con los valores
-- reales de tu factura. gpt-5.4 y 5.4-mini son de los comentarios de agent.ts;
-- el resto son ESTIMADOS — corrígelos.
create table if not exists public.model_pricing (
  model text primary key,
  input_per_1m numeric not null,
  output_per_1m numeric not null,
  cache_read_per_1m numeric not null default 0,
  note text
);
insert into public.model_pricing (model, input_per_1m, output_per_1m, cache_read_per_1m, note) values
  ('gpt-5.4',        2.50, 15.00, 0.25,  'de agent.ts'),
  ('gpt-5.4-mini',   0.75,  4.50, 0.075, 'de agent.ts'),
  ('gpt-5.1',        1.25, 10.00, 0.125, 'ESTIMADO — ajustar'),
  ('gpt-5-mini',     0.25,  2.00, 0.025, 'ESTIMADO — ajustar'),
  ('gpt-5-nano',     0.05,  0.40, 0.005, 'ESTIMADO — ajustar'),
  ('claude-sonnet-5',3.00, 15.00, 0.30,  'ESTIMADO — ajustar')
on conflict (model) do nothing;

-- Costo por lead / etapa (agente) / modelo. El site-id se resuelve a lead vía
-- sites. Los tokens cache_read se cobran al precio de cache (mucho menor).
create or replace view public.lead_cost_by_stage as
select
  coalesce(sc.lead_id, s.lead_id) as lead_id,
  tu.agent,
  tu.model,
  sum(tu.input_tokens) as input_tokens,
  sum(tu.output_tokens) as output_tokens,
  sum(tu.cache_read_tokens) as cache_read_tokens,
  round(
    (sum(tu.input_tokens)::numeric / 1e6 * coalesce(mp.input_per_1m, 0))
    + (sum(tu.output_tokens)::numeric / 1e6 * coalesce(mp.output_per_1m, 0))
    + (sum(tu.cache_read_tokens)::numeric / 1e6 * coalesce(mp.cache_read_per_1m, 0)),
    4
  ) as cost_usd
from public.token_usage tu
join public.session_context sc on sc.session_id = tu.session_id
left join public.sites s on s.id = sc.site_id
left join public.model_pricing mp on mp.model = tu.model
where coalesce(sc.lead_id, s.lead_id) is not null
group by coalesce(sc.lead_id, s.lead_id), tu.agent, tu.model,
         mp.input_per_1m, mp.output_per_1m, mp.cache_read_per_1m;

-- Costo total por lead (suma de todas las etapas): el número que buscas.
create or replace view public.lead_cost_total as
select
  lead_id,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(cache_read_tokens) as cache_read_tokens,
  round(sum(cost_usd), 4) as cost_usd
from public.lead_cost_by_stage
group by lead_id;
