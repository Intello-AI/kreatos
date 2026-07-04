-- Capturas propias de las referencias (design-scout con Playwright):
-- desktop (screenshot_path, columna existente) + mobile. Público para que
-- el dashboard las muestre sin depender de servicios externos (mShots).

alter table public.design_references
  add column if not exists screenshot_mobile_path text;

insert into storage.buckets (id, name, public)
values ('design-references', 'design-references', true)
on conflict (id) do nothing;
