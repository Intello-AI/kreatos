-- Cada follow-up al agente crea un run nuevo (wrun_...) en la misma sesión
-- durable. eve_run_id guarda el último (compat); eve_run_ids acumula la cadena
-- completa para que el panel de actividad reproduzca todo el historial.

alter table public.sites add column if not exists eve_run_ids text[] not null default '{}';

comment on column public.sites.eve_run_ids is
  'Cadena de runs de eve del sitio, en orden. El panel de actividad los reproduce secuencialmente; el último es el vivo.';

-- Backfill: sitios con run conocido arrancan la cadena con él.
update public.sites
set eve_run_ids = array[eve_run_id]
where eve_run_id is not null and eve_run_ids = '{}';
