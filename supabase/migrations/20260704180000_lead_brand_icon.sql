-- Isotipo/marca cuadrada elegida por brand-curator para favicon y app icons
-- (distinta del logo: un wordmark horizontal no funciona como icono).
alter table public.lead_brand
  add column icon_path text;

comment on column public.lead_brand.icon_path is
  'Ruta en brand-assets del isotipo cuadrado (favicon/apple-icon).';
