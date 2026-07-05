-- Preguntas HITL pendientes: el hook `pending-inputs` del agente inserta una
-- fila por cada input.requested del stream y las marca respondidas cuando la
-- sesión recibe el siguiente mensaje. El dashboard muestra campana + toast.
create table if not exists public.pending_inputs (
  request_id   text primary key,
  session_id   text not null,
  prompt       text not null,
  options      jsonb,
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists pending_inputs_open_idx
  on public.pending_inputs (created_at desc)
  where responded_at is null;

create index if not exists pending_inputs_session_idx
  on public.pending_inputs (session_id);

grant select, insert, update, delete on public.pending_inputs to service_role;

alter publication supabase_realtime add table public.pending_inputs;
