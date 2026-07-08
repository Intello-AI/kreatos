-- Estructura del sitio ACTUAL del lead (si tiene web): páginas y secciones
-- extraídas por brand-curator (describe_current_site). El art-director la usa
-- como referencia de composición del negocio real — qué cuenta hoy y en qué
-- orden — sin re-visitar el sitio.
alter table public.lead_brand
  add column if not exists site_structure jsonb;

comment on column public.lead_brand.site_structure is
  'Esqueleto del sitio web actual del lead: {sourceUrl, describedAt, pages:[{url,title,sections:[{heading,kind,summary}]}], composition}. Lo escribe describe_current_site (brand-curator); referencia de composición para el art-director.';
