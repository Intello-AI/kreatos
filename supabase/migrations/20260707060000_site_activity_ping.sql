-- Último "latido" de actividad por sitio: el max(created_at) de token_usage
-- (una fila por step del agente) vía session_context. El badge de estado usaba
-- sites.status_updated_at (el momento de ENTRAR a "generating"), que NO se
-- mueve durante un build largo → marcaba "Detenido" a generaciones vivas. Con
-- esto el "stale" se mide desde la ÚLTIMA actividad real: una generación viva
-- emite steps constantemente; una muerta deja de emitir.
create or replace view public.site_activity_ping as
select
  sc.site_id,
  max(tu.created_at) as last_activity_at
from public.token_usage tu
join public.session_context sc on sc.session_id = tu.session_id
where sc.site_id is not null
group by sc.site_id;
