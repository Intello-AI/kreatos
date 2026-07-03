-- Tabla de leads: negocios locales sin sitio web encontrados por el agente
-- lead-finder en Google Maps (Places API New).
--
-- ToS de Google Places: solo place_id puede almacenarse indefinidamente. El
-- resto de campos (name, category, address, phone, rating, reviews_count) es
-- cache refrescable con fetched_at; se re-hidrata llamando Place Details por
-- place_id (helper fetchPlaceDetails en apps/commercial/agent/lib/places.ts).

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  place_id      text unique not null,
  name          text,
  category      text,
  -- Tipo legible de Google (primaryTypeDisplayName, ej. "Restaurante") y
  -- categorías crudas (types). Contexto para el agente de propuestas (fase 2).
  business_type text,
  google_types  text[],
  -- editorialSummary de Google cuando existe; describe qué es el negocio.
  description   text,
  address       text,
  phone         text,
  -- Places API no expone emails; se llena en fase 2 vía enriquecimiento.
  email         text,
  rating        numeric,
  reviews_count int,
  maps_uri      text,
  city          text not null,
  status        text not null default 'new'
                check (status in ('new', 'proposal_ready', 'contacted', 'won', 'lost')),
  -- Cuándo cambió status por última vez (lo mantiene el trigger de abajo).
  status_updated_at timestamptz,
  -- Información libre agregada manualmente o por agentes de fase 2.
  notes         text,
  -- Instrucciones para el agente site-builder (estilo, colores, referencias).
  site_instructions text,
  fetched_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on table public.leads is
  'Negocios locales sin sitio web, encontrados por el agente lead-finder. Solo place_id es persistente por ToS de Google; el resto es cache con fetched_at.';

create index if not exists leads_status_idx on public.leads (status);

-- Mantiene status_updated_at al cambiar status.
create or replace function public.touch_lead_status_updated_at()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;
  return new;
end $$;

create trigger leads_status_updated_at
  before update of status on public.leads
  for each row execute function public.touch_lead_status_updated_at();

-- Timeline del lead: hitos y notas, escritos por agentes o a mano.
-- Fase 2 registra aquí lo que hace ('proposal_ready', 'email_sent', ...).
create table if not exists public.lead_activity (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  type       text not null,          -- ej: 'note', 'proposal_ready', 'email_sent', 'status_change'
  note       text,
  actor      text,                   -- ej: 'lead-finder', 'commercial', 'manual'
  created_at timestamptz not null default now()
);

comment on table public.lead_activity is
  'Historial por lead: hitos de agentes (fase 2) y notas manuales. status en leads es el estado actual; esto es el cómo llegó ahí.';

create index if not exists lead_activity_lead_id_idx on public.lead_activity (lead_id, created_at desc);

-- El CLI de Supabase ya no auto-expone tablas nuevas a los roles del Data API
-- (auto_expose_new_tables deshabilitado). El agente y la página /leads acceden
-- con service_role vía PostgREST; se otorga solo a ese rol.
grant select, insert, update, delete on public.leads to service_role;
grant select, insert, update, delete on public.lead_activity to service_role;
