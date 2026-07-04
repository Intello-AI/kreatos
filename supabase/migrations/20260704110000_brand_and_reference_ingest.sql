-- Ficha de marca por lead (logo, colores, nombre corto, servicios reales) y
-- pipeline de ingesta de referencias de diseño: José pega URLs, el subagente
-- design-scout las analiza UNA vez (sitemap, secciones, componentes, paleta,
-- tipografía, do/dont steal) y el resultado alimenta la fase spec.

create table if not exists public.lead_brand (
  lead_id         uuid primary key references public.leads (id) on delete cascade,
  -- Nombre corto para header/logo ("Zúñiga & Asociados"), no la razón social.
  short_name      text,
  -- Ruta en el bucket brand-assets (logo del cliente).
  logo_path       text,
  -- Colores de marca en hex: ["#0f172a", "#b45309"].
  colors          jsonb not null default '[]'::jsonb,
  tagline         text,
  -- Servicios reales dictados por José/el cliente: [{name, description}].
  services        jsonb not null default '[]'::jsonb,
  differentiators text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger lead_brand_touch_updated_at
  before update on public.lead_brand
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.lead_brand to service_role;

-- Ingesta de referencias: al pegar una URL nace 'pending'; design-scout la
-- analiza y deja el brief completo en `analysis` + los campos curados.
alter table public.design_references
  add column status      text not null default 'analyzed'
              check (status in ('pending', 'analyzed', 'failed')),
  add column analyzed_at timestamptz,
  -- Brief estructurado del scout: {sitemap, sections[], components[], notes}.
  add column analysis    jsonb;

-- Las nuevas referencias que insertará el dashboard entran como pending;
-- el default 'analyzed' de arriba solo protege filas curadas a mano previas.
alter table public.design_references alter column status set default 'pending';
-- industries/style_tags los llena el análisis; al ingresarlas solo hay URL.
alter table public.design_references alter column industries set default '{}';
alter table public.design_references alter column style_tags set default '{}';

-- Logos y assets de marca; público para previews en el dashboard e imágenes.
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;
