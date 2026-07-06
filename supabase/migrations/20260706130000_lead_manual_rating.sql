-- Calificación MANUAL del lead por el humano (bueno/regular/malo) + nota.
-- Alimenta el loop de feedback: lead-finder lee el agregado y sesga futuras
-- búsquedas hacia perfiles calificados "bueno", lejos de los "malo".
alter table public.leads
  add column if not exists manual_rating text
    check (manual_rating in ('good', 'regular', 'bad')),
  add column if not exists rating_note text,
  add column if not exists rated_at timestamptz;

create index if not exists leads_manual_rating_idx on public.leads (manual_rating);

comment on column public.leads.manual_rating is
  'Calificación humana del lead: good|regular|bad. Señal del loop de aprendizaje del lead-finder.';
