-- Habilita Supabase Realtime (postgres_changes) para sites y site_versions:
-- el dashboard se suscribe a cambios del sitio en vez de hacer polling.
alter publication supabase_realtime add table public.sites;
alter publication supabase_realtime add table public.site_versions;
