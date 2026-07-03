-- Perfiles de usuario, 1:1 con auth.users. Se crea automáticamente al
-- registrarse (trigger handle_new_user).

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil 1:1 con auth.users; fila creada por trigger al registrarse.';

-- RLS: cada usuario ve y edita solo su propio perfil.
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Data API no auto-expone tablas nuevas: grants explícitos.
-- authenticated queda gobernado por las políticas RLS de arriba.
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- updated_at automático.
create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

-- Crea el perfil al registrarse un usuario.
-- SECURITY DEFINER es necesario (el signup corre como supabase_auth_admin,
-- sin permisos sobre public.profiles). Es una función de trigger: PostgREST
-- no puede invocarla directamente, y search_path vacío evita hijacking.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
