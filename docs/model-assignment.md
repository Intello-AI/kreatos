# Asignación de modelos por agente/tool

Referencia viva de qué modelo corre en cada agente y cada tool del sistema.
Última actualización: 2026-07-07.

## Principio

- **Orquestadores** (agentes que corren un loop agéntico de N pasos) necesitan
  **adherencia**: un modelo barato "baila" en 55-147 pasos (le pasó a qwen:
  saltaba checkpoints, improvisaba en el registry). Por eso van en modelos
  probados (gpt/Sonnet); GLM/DeepSeek/qwen entran solo por **A/B medido**.
- **Tools** son **single-shot** (`generateText` aislado, sin loop) → sin riesgo
  de adherencia → ahí los modelos baratos/fuertes (GLM/DeepSeek/qwen) son
  seguros. Su hogar ideal son los tools.
- **Visión** solo está confirmada en **gpt/Sonnet**. Mover extracción/juicio
  visual a GLM/qwen-VL sin verificar el endpoint rompe la tarea.
- **Regla de oro**: nunca abaratar el `vision-judge` (`review_screenshots`) — es
  el gate que caza el sitio genérico/feo.
- El multiplicador #1 de costo/tiempo es el **modelo del orquestador**, no los
  tools de codegen. Medido en prod: Sonnet como site-builder ≈ $9.95/build vs
  gpt-5.4 ≈ $1.94 (−80%); el loop agéntico (bash/edit/read/write) = ~75% del
  costo, y draft_section (codegen) solo ~1.8%.

## Orquestadores (agentes)

| Agente | Modelo | Reasoning | Toggle env | Rol |
|---|---|---|---|---|
| root `commercial` | gpt-5.1 | medium | `ROOT_MODEL` | rutea/delega |
| **art-director** | **claude-sonnet-5** | high | `ART_DIRECTOR_MODEL=gpt` → gpt-5.4 | cerebro de composición del spec |
| **site-builder** | **gpt-5.4** | — | `SITE_BUILDER_MODEL` (sonnet · gpt · gpt-mini · qwen · glm · deepseek) | materializa/itera/publica el sitio |
| design-scout | gpt-5.1 | high | — | analiza referencias (**visión**) |
| brand-curator | gpt-5.1 | medium | — | cura la marca, chatea (**visión**) |
| proposal | gpt-5.1 | medium | — | genera propuestas (structured output) |
| lead-finder | gpt-5-nano | low | — | busca leads |
| outreach | gpt-5-mini | low | — | drafts de contacto |

- Sonnet se queda en **art-director** (un spec flojo se arrastra a todo el sitio).
- site-builder default pasó de Sonnet a **gpt-5.4** (2026-07-07) por el dato de
  prod; Sonnet queda opt-in con `SITE_BUILDER_MODEL=sonnet`.

## Tools con modelo interno (router `apps/commercial/agent/lib/tool-models.ts`)

| Tarea | Tool | Modelo | Toggle env | Nota |
|---|---|---|---|---|
| **codegen** | `draft_section` | **deepseek-v4-pro** | `TOOL_MODEL_CODEGEN` | escribe cada custom `.tsx`. A/B: `zai:glm-5.2` |
| transcribe | `draft_surface` | gpt-5-nano | `TOOL_MODEL_TRANSCRIBE` | transcribe superficies mecánicas; fallback gpt-5-mini |
| translate | `translate_copy` | qwen3.7-plus | `TOOL_MODEL_TRANSLATE` | traduce el copy; fallback gpt-5-mini |
| vision-extract | `view_reference_screenshots` · `capture_screenshots` | gpt-5-mini | `TOOL_MODEL_VISION_EXTRACT` | LEE una imagen (**visión**) |
| **vision-judge** | `review_screenshots` | **claude-sonnet-5** | `TOOL_MODEL_VISION_JUDGE` | JUZGA el diseño — gate, no se abarata |
| brand-vision | `analyze_brand_image` | gpt-5-mini | `TOOL_MODEL_BRAND_VISION` | ve el logo/paleta del lead (**visión**) |

Formato del override: `TOOL_MODEL_<TAREA>=<provider>:<model>`.
Providers: `openai` (default) · `anthropic` · `alibaba` · `deepseek` · `zai`
(→ Vercel AI Gateway, slug `zai/<model>`) · `gateway` (slug completo). El label
del modelo = la parte tras `:`, así casa con la llave de `model_pricing`.

## A/B abiertos (2026-07-07)

Ambos toggles ya cableados; correr = setear env + leer las vistas.

```bash
# Codegen: GLM vs DeepSeek (calidad del componente; single-shot, seguro)
TOOL_MODEL_CODEGEN=zai:glm-5.2
#   → select * from build_quality_by_codegen;   (review_rounds, approved%, costo)

# Orquestador del site-builder: GLM vs gpt-5.4 (adherencia en el loop)
SITE_BUILDER_MODEL=glm
#   → select * from build_cost_by_model;        (costo, wall, pasos, ciclos, calidad)
```

Dev: `apps/commercial/.env.local`. Prod: env de `kreatos-agent` en Vercel + redeploy.

## Telemetría (vistas en Supabase)

- `build_summary` — una fila por build: costo, wall, pasos, `dominant_model`,
  `codegen_model`, ciclos build-repair, ms de `pnpm build`, latencia por
  sección, rondas de QA, `approved`, issues.
- `build_cost_by_model` — A/B del **orquestador**: costo/wall/pasos/ciclos +
  calidad (`review_rounds_p50`, `approved_pct`) por modelo dominante.
- `build_quality_by_codegen` — A/B del **codegen**: calidad + latencia + costo
  por modelo que escribe los componentes.

Las columnas basadas en `tool_timing` (ms de build, latencia de sección, rondas
de QA, `approved`, `codegen_model`) se pueblan solo para builds **posteriores al
redeploy** que trae la instrumentación; costo/wall/pasos funcionan sobre el
histórico desde `token_usage`.

## Llaves (env)

| Provider | Env | Dónde |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | dev + prod |
| Anthropic | `ANTHROPIC_API_KEY` | dev + prod |
| Alibaba (qwen) | `ALIBABA_API_KEY` | dev + prod |
| DeepSeek | `DEEPSEEK_API_KEY` | dev + prod |
| GLM (AI Gateway) | `AI_GATEWAY_API_KEY` | dev; prod usa OIDC de Vercel |
