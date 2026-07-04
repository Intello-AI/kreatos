-- La ficha de marca se vuelve conversacional: José chatea con brand-curator
-- (sube fotos/logos, el agente decide y guarda). La sesión eve vive en la
-- propia fila de lead_brand, como en sites.

alter table public.lead_brand
  add column eve_session_id text,
  add column eve_run_ids    text[] not null default '{}',
  -- Imágenes aprobadas por el curador (rutas en brand-assets).
  add column images         jsonb not null default '[]'::jsonb;

-- Realtime: el sheet ve la ficha actualizarse mientras el agente trabaja.
alter publication supabase_realtime add table public.lead_brand;
