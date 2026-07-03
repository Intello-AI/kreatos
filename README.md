# Kreatos

App interna multi-agente para generación de leads. **Stage 1**: el agente `lead-finder`
busca negocios locales sin sitio web en Google Maps (Places API New) y los guarda como
leads en Supabase. Plan completo: [`docs/stage-1-lead-finder-plan.md`](docs/stage-1-lead-finder-plan.md).

## Agente lead-finder (Stage 1)

### Estructura

- `apps/web` — Next.js 16; monta el agente eve vía `withEve()` y sirve la página interna `/leads`.
- `apps/commercial` — app eve (`lead-finder`): instrucciones, tools, skill y schedule bajo `apps/commercial/agent/`.
- `supabase/` — stack local + migración de la tabla `leads`.

### Variables de entorno

Placeholders en [`.env.example`](.env.example). Copia los valores reales a:

| Archivo | Lo carga | Necesita |
| --- | --- | --- |
| `apps/commercial/.env.local` | runtime eve (tools + model) | `GOOGLE_PLACES_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` |
| `apps/web/.env.local` | Next.js (`/leads`) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

Supabase local: `SUPABASE_URL=http://127.0.0.1:54321`; la service role key sale de
`supabase status`. `OPENAI_API_KEY` sale del [dashboard de OpenAI](https://platform.openai.com/api-keys) —
el agente usa el provider directo de OpenAI (`apps/commercial/agent/agent.ts`, model
`gpt-5-nano`), sin AI Gateway. Cambiar de modelo/provider = editar esa línea de `agent.ts`.

### Levantar el stack local (dev)

Desde la raíz del monorepo (necesita Docker corriendo):

```sh
pnpm db:start        # supabase local (API :54321, DB :54322, Studio :54323)
pnpm dev             # next dev (web) + eve montado en el mismo origin (:3000)
```

Primera vez / DB fresca: `pnpm db:reset` aplica las migraciones. `pnpm db:stop` apaga el stack.

### Probar el agente

```sh
pnpm leads:search    # crea sesión: "busca restaurantes sin sitio web en Torreón"
pnpm leads:daily     # dispara el schedule daily-leads a mano (ruta dev)
pnpm agent:tui       # alternativa: REPL interactivo de eve (standalone)
```

`leads:search` devuelve `continuationToken` (follow-ups) y `sessionId`; el stream vive en
`GET http://localhost:3000/eve/v1/session/<id>/stream`. No corras `agent:tui` y `pnpm dev`
a la vez — cada uno levanta su propio dev server de eve.

Los leads aparecen en `http://localhost:3000/leads`.

### Cómo funciona el schedule

`apps/commercial/agent/schedules/daily-leads.md` corre diario con cron `0 14 * * *`.
**Vercel evalúa el cron en UTC**: 14:00 UTC = 8:00 AM America/Mexico_City (UTC-6).
Ciudad y categorías se configuran editando ese mismo archivo.

En dev el cron **no** dispara. Para probarlo a mano:

```sh
curl -X POST http://localhost:3000/eve/v1/dev/schedules/daily-leads
```

En Vercel, cada schedule se convierte en un Vercel Cron Job automáticamente.

### ToS de Google Places

Solo `place_id` se almacena indefinidamente. El resto de campos de `leads` (nombre,
teléfono, dirección, rating) es cache refrescable con `fetched_at`; se re-hidrata con
`fetchPlaceDetails(placeId)` en `apps/commercial/agent/lib/places.ts`.

### Dónde enchufan los agentes de Stage 2

- **Restructura (paso 0 de Stage 2)**: el root se renombró a orquestador `commercial` (apps/commercial; "kreatos" colisionaba con el package root del workspace) y
  `lead-finder` baja a subagente declarado, simétrico con `proposal` y `outreach`:
  `agent/subagents/{lead-finder, proposal, outreach}/` (cada uno con su propio `agent.ts`
  con `description`, `instructions.md` y tools; eve delega del root al subagente). Decisión
  registrada en `docs/stage-1-lead-finder-plan.md` §12.
- **Site-builder**: agente hermano (p. ej. `apps/site-builder/` con el mismo patrón eve).
- **Conexiones externas** (Figma, Gmail): `apps/commercial/agent/connections/` (MCP/OpenAPI).
- El campo `status` de `leads` (`new → proposal_ready → contacted → won/lost`) ya modela
  ese ciclo de vida.

---

# Turborepo starter

This Turborepo starter is maintained by the Turborepo core team.

## Using this example

Run the following command:

```sh
npx create-turbo@latest
```

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app
- `web`: another [Next.js](https://nextjs.org/) app
- `@repo/ui`: a stub React component library shared by both `web` and `docs` applications
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo build
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo build
pnpm dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo build --filter=docs
```

Without global `turbo`:

```sh
npx turbo build --filter=docs
pnpm exec turbo build --filter=docs
pnpm exec turbo build --filter=docs
```

### Develop

To develop all apps and packages, run the following command:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo dev
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo dev
pnpm exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo dev --filter=web
```

Without global `turbo`:

```sh
npx turbo dev --filter=web
pnpm exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo login
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo login
pnpm exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo link
```

Without global `turbo`:

```sh
npx turbo link
pnpm exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.dev/docs/reference/configuration)
- [CLI Usage](https://turborepo.dev/docs/reference/command-line-reference)
# kreatos
