-- lead-finder ahora también guarda negocios CON sitio web (candidatos a
-- rediseño/mejora). website es cache de websiteUri de Places, refrescable
-- con fetched_at igual que el resto de campos.

alter table public.leads add column if not exists website text;

comment on column public.leads.website is
  'websiteUri de Google Places. NULL = negocio sin sitio web (lead de sitio nuevo); con valor = candidato a rediseño.';

comment on table public.leads is
  'Negocios locales encontrados por el agente lead-finder (con o sin sitio web). Solo place_id es persistente por ToS de Google; el resto es cache con fetched_at.';
