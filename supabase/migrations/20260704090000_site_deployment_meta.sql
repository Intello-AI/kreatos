-- Metadatos de deployment que Vercel ya nos da y no guardábamos:
-- por versión (commit + deployment + cuándo quedó READY el preview) y
-- por sitio (cuándo se publicó producción).

alter table public.site_versions
  add column commit_sha text,
  add column vercel_deployment_id text,
  add column deployed_at timestamptz;

comment on column public.site_versions.commit_sha is
  'SHA del commit de la rama v{N} (lo devuelve push_site_version).';
comment on column public.site_versions.vercel_deployment_id is
  'uid del deployment preview en Vercel para esta versión.';
comment on column public.site_versions.deployed_at is
  'Momento en que el deployment preview quedó READY.';

alter table public.sites
  add column published_at timestamptz;

comment on column public.sites.published_at is
  'Momento en que el deployment de producción quedó READY (publish_site).';
