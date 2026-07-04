-- Conversaciones del chat directo con el orquestador (home del dashboard):
-- título autogenerado + sesión eve (continuation) + cadena de runs para
-- reconectar el stream (mismo modelo que lead_brand.eve_run_ids).

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nueva conversación',
  eve_session_id text,
  eve_run_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger chat_conversations_touch_updated_at
  before update on public.chat_conversations
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.chat_conversations to service_role;
