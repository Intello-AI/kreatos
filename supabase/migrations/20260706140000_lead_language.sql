-- Idioma primario del cliente del lead: define el locale DEFAULT del sitio
-- generado (locales[0], que vive en "/" sin prefijo). Antes el default era
-- SIEMPRE español; ahora se elige por lead (MX = 'es'; clientes de US = 'en').
alter table public.leads
  add column if not exists language text not null default 'es'
    check (language in ('es', 'en', 'pt', 'fr'));

comment on column public.leads.language is
  'Idioma primario del cliente (es|en|pt|fr). Es el locale DEFAULT del sitio generado (locales[0], sin prefijo en "/").';
