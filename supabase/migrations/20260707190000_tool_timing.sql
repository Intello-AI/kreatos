-- Telemetría de LATENCIA por tool (Fase 0 del plan de eficiencia, 2026-07-07).
-- token_usage/tool_calls ya dan steps, costo, conteo de ciclos build-repair
-- (= count de filas build_check por sesión) y wall-clock por build (span de
-- created_at). Lo que NO se medía y decide las apuestas caras del plan:
--   * duración de `pnpm build` dentro de build_check (¿es el hog del wall-clock?
--     → justifica o no el lever 10: iterar contra `next dev` en vez de prod)
--   * latencia por draft_section (→ justifica o no el lever 8: paralelizar)
-- Una fila por llamada instrumentada. Best-effort desde el agente (service role).
create table if not exists public.tool_timing (
  id           bigint generated always as identity primary key,
  session_id   text        not null,
  agent        text        not null,
  tool         text        not null,
  duration_ms  integer     not null,
  ok           boolean,
  -- meta: { rung, rungMs:{validate-config,typecheck,build}, archetype, model, retried }
  meta         jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists tool_timing_session_idx on public.tool_timing (session_id);
create index if not exists tool_timing_tool_idx    on public.tool_timing (tool, created_at desc);

comment on table public.tool_timing is
  'Latencia por tool del site-builder (Fase 0 eficiencia): build_check (con rungMs) y draft_section. Complementa token_usage/tool_calls que ya dan steps/costo/ciclos.';
