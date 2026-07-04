-- Realtime para la biblioteca de referencias: el dashboard ve el paso
-- pending → analyzed/failed en vivo mientras design-scout trabaja.
alter publication supabase_realtime add table public.design_references;
