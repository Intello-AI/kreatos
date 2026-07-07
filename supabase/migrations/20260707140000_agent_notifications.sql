-- ── Capa 0 de notificaciones: registro DURABLE de tareas del agente + atribución ──
-- Antes, "tarea terminada" solo existía en el stream client-side (se perdía al
-- cerrar la pestaña) y no se registraba QUIÉN la inició. Esta tabla es la base
-- de todo: campana in-app (realtime), sonido y correo (raíz).
--
-- Ciclo de vida de una fila:
--   1. La UI, al delegar una tarea, inserta la fila 'task'/'running' con el
--      user_id del que la inició (atribución) + el sujeto (lead/site).
--   2. El hook del agente RAÍZ (agent="root"), en session.completed/failed,
--      la pasa a 'done'/'failed'.
--   3. Los hooks de los SUBAGENTES insertan filas 'milestone' (art-director
--      terminó el spec, site-builder desplegó, etc.), resolviendo user_id y
--      root_session_id vía la tarea 'running' del mismo sujeto.

create table if not exists public.agent_notifications (
  id              uuid primary key default gen_random_uuid(),
  -- Quién la inició (atribución). Null si el arranque no fue por un usuario
  -- autenticado (schedule automático).
  user_id         uuid references auth.users(id) on delete set null,
  -- Sesión de eve: para la tarea raíz = la que arrancó el usuario; para un
  -- hito = la sesión del subagente.
  session_id      text,
  -- Sesión raíz de la tarea: agrupa la fila 'task' con sus 'milestone'.
  root_session_id text,
  -- 'task' = lo que pidió el usuario (raíz, dispara sonido+correo); 'milestone'
  -- = hito de un subagente (dispara sonido+notif in-app, NO correo).
  level           text not null default 'task'
                    check (level in ('task', 'milestone')),
  status          text not null
                    check (status in ('running', 'done', 'failed', 'needs_input')),
  -- 'site_build' | 'brand_curate' | 'proposal' | 'outreach' | 'references' |
  -- 'spec' | 'chat' | ... (el arranque/hook decide el kind).
  kind            text not null,
  title           text not null,
  body            text,
  subject_type    text check (subject_type in ('lead', 'site')),
  subject_id      uuid,
  -- Ruta en el dashboard para "ir al sujeto" desde la notificación.
  href            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  read_at         timestamptz
);

-- Feed por usuario, más nuevo primero.
create index if not exists agent_notifications_user_idx
  on public.agent_notifications (user_id, created_at desc);

-- El hook raíz busca la tarea a cerrar por su sesión raíz.
create index if not exists agent_notifications_root_idx
  on public.agent_notifications (root_session_id);

-- El hook de subagente busca la tarea 'running' del sujeto para copiar
-- user_id + root_session_id a su hito.
create index if not exists agent_notifications_subject_open_idx
  on public.agent_notifications (subject_type, subject_id)
  where level = 'task' and status = 'running';

-- Mismo patrón que pending_inputs: el agente escribe con service_role, la UI
-- lee vía server actions (filtrando user_id) y se suscribe a realtime para el
-- vivo. (Sin RLS, como pending_inputs — app de un puñado de usuarios de confianza.)
grant select, insert, update, delete on public.agent_notifications to service_role;

alter publication supabase_realtime add table public.agent_notifications;

-- Atribución a nivel sesión: quién arrancó la sesión (lo setea la UI al delegar;
-- el hook lo lee para poblar user_id en done/failed cuando haga falta).
alter table public.session_context
  add column if not exists user_id uuid references auth.users(id) on delete set null;
