-- Calidad del sitio web del lead: prioriza el pipeline hacia los que NO tienen
-- web o la tienen fea/vieja (venta de sitio nuevo / rediseño). La evalúa
-- lead-finder al vuelo (lib/website-quality.ts).
--   none · broken · outdated · weak · decent · unknown
alter table public.leads
  add column if not exists website_quality text,
  add column if not exists website_score integer,
  add column if not exists website_signals jsonb not null default '[]'::jsonb;

-- Índice para filtrar/ordenar por calidad (los "vendibles" primero).
create index if not exists leads_website_quality_idx on public.leads (website_quality);

comment on column public.leads.website_quality is
  'Calidad del sitio: none|broken|outdated|weak|decent|unknown. none/broken/outdated/weak = objetivo comercial fuerte.';
