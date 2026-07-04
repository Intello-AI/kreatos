-- Stop cooperativo de generaciones: el humano marca 'cancelled' desde el
-- dashboard y las tools del site-builder abortan en su siguiente llamada
-- (getSite lanza). Retomar = nueva delegación que vuelve a 'generating'.
alter table public.sites
  drop constraint if exists sites_status_check;

alter table public.sites
  add constraint sites_status_check
  check (status in ('brief', 'generating', 'preview', 'approved', 'published', 'failed', 'cancelled'));
