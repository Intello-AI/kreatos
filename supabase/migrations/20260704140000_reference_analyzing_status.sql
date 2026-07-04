-- Estado intermedio 'analyzing': design-scout marca la referencia al tomarla,
-- y el dashboard (realtime) muestra qué se está analizando ahora mismo.
alter table public.design_references
  drop constraint design_references_status_check;
alter table public.design_references
  add constraint design_references_status_check
  check (status in ('pending', 'analyzing', 'analyzed', 'failed'));
