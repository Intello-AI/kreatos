-- Pipeline site-builder: la BDD es el centro de operaciones.
-- `sites` = estado actual de cada sitio; `site_versions` = historial reproducible
-- (cada iteración guarda el spec completo); `design_references`/`design_presets`/
-- `stock_images` = biblioteca de calidad curada que alimenta la fase de spec.

-- Función genérica de updated_at, reutilizable por futuras tablas.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table if not exists public.sites (
  id                uuid primary key default gen_random_uuid(),
  -- Un sitio por lead (unique). Si algún día se necesitan varios, quitar el unique.
  lead_id           uuid not null unique references public.leads (id) on delete cascade,
  -- Nombre del repo GitHub y del proyecto Vercel.
  slug              text not null unique,
  status            text not null default 'brief'
                    check (status in ('brief', 'generating', 'preview', 'approved', 'published', 'failed')),
  status_updated_at timestamptz,
  -- Form del dashboard tal cual (estilo, colores, referencias, flags). El agente
  -- lo compone en site_versions.spec v1.
  brief             jsonb not null,
  repo_url          text,
  vercel_project_id text,
  -- URL de producción tras publicar (merge a main).
  deploy_url        text,
  current_version   int,
  -- Sesión eve que lo genera; permite follow-ups (iteraciones, aprobar, publicar).
  eve_session_id    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.sites is
  'Sitios web generados por el subagente site-builder, uno por lead. El historial de iteraciones vive en site_versions.';

create index if not exists sites_status_idx on public.sites (status);

create trigger sites_updated_at
  before update on public.sites
  for each row execute function public.touch_updated_at();

-- Reutiliza la función de leads: misma firma (setea status_updated_at si cambia status).
create trigger sites_status_updated_at
  before update of status on public.sites
  for each row execute function public.touch_lead_status_updated_at();

create table if not exists public.site_versions (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  version_n   int not null,
  -- Contrato completo brief→código: business snapshot + design (preset, paleta,
  -- fonts, referencias con takeaways) + secciones con copy + imágenes + seo + flags.
  -- Reproducible: con este spec se puede regenerar el sitio.
  spec        jsonb not null,
  changelog   text,
  preview_url text,
  -- Salida de scripts/qa.ts del template (gates: build, validate, axe, lighthouse).
  qa_report   jsonb,
  actor       text,
  created_at  timestamptz not null default now(),
  unique (site_id, version_n)
);

comment on table public.site_versions is
  'Historial de iteraciones de cada sitio. spec es el contrato completo y reproducible de esa versión.';

create index if not exists site_versions_site_idx on public.site_versions (site_id, version_n desc);

-- Biblioteca de referencias de diseño curadas a mano (2-3 por giro). El agente
-- las traduce a decisiones (takeaways) en el spec, nunca las copia.
create table if not exists public.design_references (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  url             text not null,
  -- Supabase Storage: design-refs/<slug>.png (la referencia sobrevive si el sitio muere).
  screenshot_path text,
  industries      text[] not null,
  style_tags      text[] not null,
  palette         jsonb,
  typography      jsonb,
  layout_notes    text,
  do_steal        text,
  dont_steal      text,
  quality_score   int check (quality_score between 1 and 5),
  source          text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists design_references_industries_idx
  on public.design_references using gin (industries);

-- Metadatos de decisión de los presets. El CSS de cada preset vive en el
-- template (themes/<slug>.css); aquí va lo que el agente necesita para ELEGIR
-- durante la fase de spec, antes de tocar el sandbox.
create table if not exists public.design_presets (
  slug            text primary key,
  industries      text[] not null,
  character       text not null,
  font_pairs      text[] not null,
  hero_variants   text[] not null,
  variation_notes text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Biblioteca propia de fotos stock (Supabase Storage, bucket stock/). Fuente
-- default de imágenes de la v1 automática; fallback: Pexels API.
create table if not exists public.stock_images (
  id            uuid primary key default gen_random_uuid(),
  path          text unique not null,
  industry      text[] not null,
  tags          text[] not null default '{}',
  orientation   text check (orientation in ('landscape', 'portrait', 'square')),
  dominant_tone text,
  -- URL original (Unsplash/Pexels) para trazabilidad de licencia.
  source_url    text,
  created_at    timestamptz not null default now()
);

create index if not exists stock_images_industry_idx
  on public.stock_images using gin (industry);

grant select, insert, update, delete on public.sites to service_role;
grant select, insert, update, delete on public.site_versions to service_role;
grant select, insert, update, delete on public.design_references to service_role;
grant select, insert, update, delete on public.design_presets to service_role;
grant select, insert, update, delete on public.stock_images to service_role;

-- Seed de metadatos de los 5 presets (el CSS correspondiente vive en el template).
insert into public.design_presets (slug, industries, character, font_pairs, hero_variants, variation_notes) values
  ('obsidiana', '{contable,legal,fiscal}',
   'Sobrio, editorial, autoridad. Dark-first. Negro azulado profundo, marfil, acento ámbar discreto.',
   '{fraunces-albert,libre-caslon-albert}', '{editorial,stat-led}',
   'Variar hue del acento ±15-30°; hero editorial por default, stat-led si el negocio tiene cifras fuertes.'),
  ('cantera', '{construccion,arquitectura,remodelacion}',
   'Material, industrial, robusto. Gris concreto cálido, terracota/óxido, líneas gruesas.',
   '{archivo-inter,barlow-condensed-inter}', '{full-bleed,stat-led}',
   'Duotone con el acento sobre fotos de obra; portfolio en rows; stats reales (m², años, proyectos).'),
  ('ruta', '{logistica,transporte,fletes}',
   'Operativo, preciso, sistema en movimiento. Azul profundo casi negro, naranja señal, mono para datos.',
   '{sora-mono,manrope-mono}', '{split-image,stat-led}',
   'Microdetalles tipo tablero (badges mono, líneas punteadas); sección coverage obligatoria.'),
  ('bodega', '{distribucion,mayoreo,refacciones}',
   'Catálogo, papel, comercio serio. Crema/papel, tinta (marino o verde bosque), bordes visibles.',
   '{bricolage-instrument}', '{split-image,editorial}',
   'Services en bordered-table tipo lista de precios; grid denso; treatment warm.'),
  ('norte', '{consultoria,servicios-profesionales}',
   'Minimal refinado, espacio negativo, un solo gesto. Blanco hueso + un acento profundo a elegir por marca.',
   '{newsreader-sans,source-serif-sans}', '{stat-led,editorial}',
   'El agente elige el acento (vino/petróleo/bosque) según la marca; casi sin cards; una imagen buena o ninguna.')
on conflict (slug) do nothing;
