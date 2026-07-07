-- Fuentes de marca: la tipografía real que declara el sitio del lead (Google
-- Fonts + @font-face), extraída por scrape_brand_site.fonts y guardada por
-- save_brand_profile. Es REFERENCIA del par tipográfico de la marca para el
-- site-builder (no mandato: en un rediseño puede variar si el giro lo pide).
alter table public.lead_brand
  add column if not exists fonts text[] not null default '{}';
