# Stage 1 — Agente `lead-finder` (plan de implementación)

> App multi-agente interna para generación de leads. **Stage 1** = scaffold + un agente
> independiente `lead-finder` que busca negocios locales **sin sitio web** en Google Maps
> (Places API New) y los guarda como leads en Supabase. Stages 2+ (proposal, outreach,
> site-builder) quedan fuera de alcance, pero la estructura deja lugar para ellos.

Estado: **plan bloqueado y verificado** contra el repo actual y las docs reales de eve
(`node_modules/eve/docs/`, eve `0.19.0`). Pendiente: ejecución.

---

## 1. Stack (fijo)

Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + Supabase (local) + Vercel,
con el framework de agentes **eve** (https://eve.dev) montado en la app Next vía `withEve()`.

Arquitectura híbrida: `lead-finder` corre como agente independiente en schedule. Un futuro
agente "commercial" (subagentes proposal/outreach) y un agente hermano "site-builder" se
agregan en stages posteriores.

---

## 2. Hechos verificados del repo (2026-07-02)

- Monorepo turbo + pnpm 9. Workspace root globs `apps/*`, `packages/*`.
- `apps/web`: Next `16.2.6`, React `19.2.4`, App Router (RSC on), Tailwind v4, shadcn
  (`radix-lyra`, base `taupe`), phosphor. Solo `app/{layout,page}.tsx`. `lib/utils.ts` (`cn`).
  Alias `@/*`. tsconfig `strict: true`.
- `supabase/`: local inicializado, **sin** carpeta `migrations` todavía. Puertos: API `54321`,
  DB `54322`, Studio `54323`. `db.migrations` y `db.seed` habilitados.
- `@supabase/supabase-js` no está instalado en ningún paquete.
- Node local `25.6` (eve exige **24+**). Root `engines.node: ">=18"`.
- **Problema de workspace anidado** (se resuelve en Paso 0): `apps/web` tiene su propio
  `pnpm-workspace.yaml` + `pnpm-lock.yaml` + `.git` (1 commit local `feat: initial commit`,
  sin remote). El root ya trackea los archivos de apps/web como blobs normales (no submódulo).

## 3. Hechos verificados de eve (docs bundled, v0.19.0)

- **Filesystem-first**: el agente es un directorio `agent/`; cada slot (tools, skills,
  schedules, lib, …) es un archivo. Identidad = path (no se escribe `name`/`id`).
- **Nombre del root agent** = `package.json` `name` del app root.
- **Tools** (`defineTool` de `eve/tools`): el filename es el nombre que ve el modelo y
  **debe ser snake_case ASCII**. `inputSchema` Zod. `execute(input, ctx)`. Corren en el
  runtime de la app con `process.env` (no en el sandbox). Steps completos no se re-ejecutan;
  un step interrumpido sí → efectos no idempotentes deben protegerse (upsert es idempotente).
- **Schedules** (`.md` con frontmatter `cron:` + body, o `.ts` `defineSchedule`): cron de
  5 campos, **Vercel evalúa en UTC**. `eve dev` **no** dispara schedules; se prueban con la
  ruta de dispatch dev. Root-only (no en subagentes).
- **agent.ts** opcional; sin él, model default = `anthropic/claude-sonnet-5` (routea por
  Vercel AI Gateway → necesita `AI_GATEWAY_API_KEY` o `VERCEL_OIDC_TOKEN`).
- **withEve** (`eve/next`): envuelve `next.config`. Un solo dev server (`next dev` arranca el
  dev server de eve al lado y reescribe `/eve/v1/*` sobre el origin web). `eveRoot` apunta al
  app root del agente cuando vive fuera de la app Next. Deploy único en Vercel.
- **Canal default** `eveChannel({ auth: [vercelOidc(), localDev()] })` — fail-closed, pero
  `localDev()` abre localhost. Suficiente para dev; no se authora `channels/` custom.
- **HTTP API estable**: `POST /eve/v1/session {"message": "..."}` crea sesión durable;
  stream en `GET /eve/v1/session/:id/stream`; follow-up con `continuationToken`.

---

## 4. Estructura objetivo

```
kreatos/
├─ apps/
│  ├─ web/                         Next 16 — mount point + página /leads
│  │  ├─ next.config.ts            withEve(nextConfig, { eveRoot: "../agent" })
│  │  ├─ lib/supabase.ts           cliente service-role (server-only) para leer leads
│  │  └─ app/leads/page.tsx        RSC, tabla Tailwind plana
│  └─ agent/                       eve app root — package name: "lead-finder"
│     └─ agent/
│        ├─ instructions.md        persona + estrategia de búsqueda
│        ├─ tools/
│        │  ├─ search_businesses.ts  Places Text Search + Details, filtra websiteUri
│        │  └─ save_leads.ts         upsert dedupe por place_id
│        ├─ skills/
│        │  └─ lead-criteria.md      playbook: qué es un buen lead
│        ├─ schedules/
│        │  └─ daily-leads.md        cron 0 14 * * * (8:00 AM America/Mexico_City)
│        └─ lib/
│           ├─ constants.ts          MAX_LEADS_PER_RUN, delays, defaults, field mask
│           ├─ places.ts             textSearch() + fetchPlaceDetails(placeId)
│           └─ supabase.ts           cliente service-role del agente
├─ supabase/
│  └─ migrations/<ts>_leads.sql    tabla leads
├─ docs/
│  └─ stage-1-lead-finder-plan.md  (este archivo)
└─ .env.example                    placeholders, sin secretos
```

> **Desviación forzada por eve** (aprobada): los archivos de tool usan snake_case
> (`search_businesses.ts`, `save_leads.ts`) en lugar del kebab del brief
> (`search-businesses.ts`, `save-leads.ts`). eve rechaza nombres de tool no-snake_case.
> Skills y schedules **sí** conservan kebab (`lead-criteria.md`, `daily-leads.md`) — la
> regla snake_case aplica solo a tools.

---

## 5. Diseño de Places API (New) — costo + ToS

**Cumplir ToS**: solo `place_id` se persiste indefinidamente. El resto (name, phone,
address, rating, reviews) es cache refrescable con `fetched_at`. Helper para re-fetch por
place_id.

Flujo de `search_businesses` (rate-limit friendly):
1. **Text Search** — `POST https://places.googleapis.com/v1/places:searchText`
   - Headers: `X-Goog-Api-Key: <key>`, `X-Goog-FieldMask: places.id` (barato — solo ids)
   - Body: `{ textQuery, regionCode: "MX", languageCode: "es", pageSize: 20 }`
2. **Place Details** por cada candidato, **secuencial con delay pequeño**, cap
   `MAX_LEADS_PER_RUN = 20`:
   - `GET https://places.googleapis.com/v1/places/{id}`
   - Field mask: `id,displayName,formattedAddress,nationalPhoneNumber,rating,userRatingCount,websiteUri,types`
3. **Filtro**: lead califica ⇔ `websiteUri` ausente o vacío. Los que tienen web **nunca**
   llegan a `save_leads`.

`fetchPlaceDetails(placeId)` = helper de refresco (mismo endpoint Details) para re-hidratar
cache y para stages futuros.

---

## 6. Migración `leads`

`supabase/migrations/<timestamp>_leads.sql`:

```sql
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  place_id      text unique not null,
  name          text,
  category      text,
  address       text,
  phone         text,
  rating        numeric,
  reviews_count int,
  city          text not null,
  status        text not null default 'new'
                check (status in ('new','proposal_ready','contacted','won','lost')),
  fetched_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads (status);
```

Se aplica con `supabase db reset` (o `supabase migration up`) → verificar que corre limpio en
DB fresca.

---

## 7. Página `/leads`

`apps/web/app/leads/page.tsx` — RSC async. Lee `leads` con `apps/web/lib/supabase.ts`
(cliente service-role, server-only, nunca llega al cliente). Tabla Tailwind plana con
columnas: name, category, rating, status, created_at. Sin auth, sin design system, sin shadcn.

---

## 8. Dependencias (dentro del allowance del brief)

| Paquete | Añadir |
|---|---|
| `apps/commercial` (`lead-finder`) | `@supabase/supabase-js` (eve, zod ya instalados) |
| `apps/web` | `eve` (para `withEve`) + `@supabase/supabase-js` |

Nada más. Sin `@ai-sdk/anthropic` (se usa el default vía Gateway).

---

## 9. Variables de entorno (`.env.example`, solo placeholders)

```
GOOGLE_PLACES_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AI_GATEWAY_API_KEY=
```

- `SUPABASE_URL` local = `http://127.0.0.1:54321`; `SUPABASE_SERVICE_ROLE_KEY` sale de
  `supabase status`.
- `AI_GATEWAY_API_KEY` lo requiere eve para el model default (o `VERCEL_OIDC_TOKEN` vía
  `eve link`).
- Nunca se tocan/commitean archivos `.env` reales. `.env*` ya está en `.gitignore`.

---

## 10. Secuencia de ejecución

**Paso 0 — Colapsar workspace** (borrados verificados como seguros)
- rm `apps/web/.git`, `apps/web/pnpm-workspace.yaml`, `apps/web/pnpm-lock.yaml`
- `pnpm install` desde root → una sola raíz de workspace

**Paso 1 — Deps + metadata**
- `apps/commercial`: package name → `lead-finder`, engines node `>=24`, + `@supabase/supabase-js`
- `apps/web`: + `eve` + `@supabase/supabase-js`

**Paso 2 — Montaje**: `apps/web/next.config.ts` → `withEve(nextConfig, { eveRoot: "../agent" })`

**Paso 3 — Agente**: `lib/constants.ts` → `lib/places.ts` → `lib/supabase.ts` →
`tools/search_businesses.ts` → `tools/save_leads.ts` → `instructions.md` →
`skills/lead-criteria.md` → `schedules/daily-leads.md`

**Paso 4 — DB**: migración `leads` → `supabase db reset`

**Paso 5 — Web**: `apps/web/lib/supabase.ts` + `apps/web/app/leads/page.tsx`

**Paso 6 — Env + README**: `.env.example` + sección README

**Paso 7 — Verificar** (ver §11)

---

## 11. Verificación (mapea a acceptance criteria)

| Criterio | Cómo se verifica |
|---|---|
| `npm run dev` arranca con eve montado, sin type errors | `next dev` en apps/web + typecheck ambos paquetes; `eve info` discovery sin errores |
| Invocar `lead-finder` con "busca restaurantes sin sitio web en Torreón" → filas nuevas | `POST /eve/v1/session` con el mensaje; inspeccionar tabla `leads` |
| Todo negocio guardado no tenía `websiteUri` | filtro en `search_businesses`; los con web nunca llegan a `save_leads` |
| Re-run no duplica | upsert `on_conflict=place_id` |
| Negocios CON web nunca llegan a la DB | mismo filtro |
| `/leads` renderiza | abrir `/leads` |
| Migración aplica limpio en DB fresca | `supabase db reset` |
| `.env.example` existe, sin credenciales reales | revisar repo |

> **E2E real** (búsqueda Torreón con Places) queda al usuario: aún no hay
> `GOOGLE_PLACES_API_KEY`. El schedule **no** dispara en `eve dev`; se prueba con
> `POST /eve/v1/dev/schedules/daily-leads`, no esperando el cron real.

---

## 12. Dónde enchufa Stage 2 (fuera de alcance ahora)

> **Decisión (2026-07-03)**: al kickoff de Stage 2, **paso 0 = restructura a root
> orquestador**. El package root se renombró a `commercial` ("kreatos" colisionaba con el package root del workspace) y `lead-finder` baja a
> subagente declarado, simétrico con `proposal` y `outreach`:
> `agent/subagents/{lead-finder, proposal, outreach}/`. Racional: root delgado que solo
> delega (instructions limpias por rol, tool surface acotada por subagente — no heredan
> nada entre sí); el nombre del root deja de mentir cuando el pipeline ya no solo busca
> leads. Nada del código actual se tira: instructions/tools/skills/lib de lead-finder se
> mueven intactos a `subagents/lead-finder/` (+ `description` obligatoria en su
> `agent.ts`). Hasta ese kickoff, no se toca nada.

- **Subagentes** → `apps/commercial/agent/subagents/<id>/` (cada uno = directorio con su
  propio `agent.ts` con `description` obligatoria, `instructions.md`, `tools/`, `skills/`).
  No heredan slots del root; eve los expone al root como tools de delegación.
- **Schedules y channels siguen root-only**: `daily-leads.md` se queda en el root con el
  mismo body — el root delega la búsqueda al subagente lead-finder en vez de ejecutar las
  tools él mismo.
- **Agente site-builder** = agente hermano → nuevo `apps/site-builder/` (mismo patrón eve),
  o subagente separado según se decida.
- **Conexiones** (Figma/Gmail) → `agent/connections/` (MCP/OpenAPI). Nada de eso en Stage 1;
  no se envían emails en ningún punto de este stage.
- El campo `status` (`proposal_ready`, `contacted`, `won`, `lost`) ya deja el ciclo de vida
  del lead listo para esos agentes.

---

## 13. Stop Conditions activas

Parar y preguntar antes de: agregar dependencias fuera de {eve, supabase-js, lo que
Next/Tailwind requieran}; modificar el schema más allá de `leads`; cualquier caso donde la
API real de eve fuerce otra estructura; borrar archivos adicionales.
