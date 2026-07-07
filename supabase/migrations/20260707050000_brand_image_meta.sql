-- Descripción por imagen de marca, para que el site-builder NO re-visione qué
-- muestra cada foto (en el run de VRC gastó 5+ llamadas gpt-5.1 + round-trips
-- Sonnet adivinando equipo/retratos/nombres). El brand-curator ya VE las
-- imágenes al ingerir (analyze_brand_image, gpt-5-mini barato); aquí guarda esa
-- descripción atada al asset. Mapa ruta_de_imagen -> {description, use, person,
-- role}; fetch_brand_assets lo devuelve alineado a cada brand-<n>.webp.
alter table public.lead_brand
  add column if not exists image_meta jsonb not null default '{}'::jsonb;

comment on column public.lead_brand.image_meta is
  'Mapa ruta_de_imagen -> {description, use, person?, role?}: qué muestra cada foto de marca, para que el site-builder la nombre/coloque sin re-visionar.';
