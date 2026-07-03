-- Hook before_user_created de Supabase Auth: rechaza el registro de cualquier
-- usuario cuyo correo no sea del dominio intelloai.com. Se activa en
-- config.toml ([auth.hook.before_user_created]); en producción hay que
-- habilitarlo también en Dashboard > Authentication > Hooks.

create or replace function public.hook_restrict_signup_domain(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_domain text := lower(split_part(coalesce(event #>> '{user,email}', ''), '@', 2));
begin
  if email_domain <> 'intelloai.com' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Solo correos @intelloai.com pueden registrarse.'
      )
    );
  end if;
  return '{}'::jsonb;
end $$;

-- Solo el servicio de Auth puede ejecutar el hook.
grant execute on function public.hook_restrict_signup_domain to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_domain from authenticated, anon, public;
