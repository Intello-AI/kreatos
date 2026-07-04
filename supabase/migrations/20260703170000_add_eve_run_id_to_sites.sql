-- eve_session_id guarda el continuationToken (para follow-ups); eve_run_id
-- guarda el sessionId del run (wrun_...), necesario para el stream NDJSON
-- GET /eve/v1/session/:id/stream que alimenta el panel de actividad en vivo.

alter table public.sites add column if not exists eve_run_id text;

comment on column public.sites.eve_run_id is
  'sessionId del run de eve (wrun_...). Para streamear actividad; eve_session_id es el continuationToken para follow-ups.';
