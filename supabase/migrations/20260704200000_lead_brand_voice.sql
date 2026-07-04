-- Voz de marca extraída por brand-curator (de sitio web, redes o dictada):
-- tono, registro (usted/tú), personalidad — la consume copywriting-es.
alter table public.lead_brand
  add column voice jsonb;

comment on column public.lead_brand.voice is
  'Voz de marca: {tone, register, personality, keywords[], avoid[]}.';
