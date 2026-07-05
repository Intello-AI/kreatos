-- Lease de reclamo para design_references: cuándo una corrida reclamó una
-- referencia para analizarla. get_pending_references solo re-reclama filas
-- 'analyzing' cuyo claimed_at es viejo (run muerto) — antes re-reclamaba TODAS
-- las 'analyzing' sin lease, causando doble análisis / carrera entre corridas.
alter table public.design_references
  add column if not exists claimed_at timestamptz;

-- Índice para el filtro del claim (status + claimed_at).
create index if not exists design_references_claim_idx
  on public.design_references (status, claimed_at);
