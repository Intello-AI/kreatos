---
description: Mapa error→fix para el ciclo de reparación de build (paso 8). Cuando build_check devuelve ok:false, cada clase de error tiene UNA causa en TUS superficies y UN fix. Consúltalo para parchar en una pasada, sin adivinar ni preguntar al humano.
---

# Reparación de build (error → fix)

`build_check` corre validate-config → typecheck → build y devuelve `errors` +
`files`. Un rung rojo es SIEMPRE tu config/copy/custom, NUNCA el motor. Localiza
la clase abajo, parcha con `edit_file`, re-llama `build_check`. Errores tuyos: sin
tope de intentos. PROHIBIDO preguntar al humano o cerrar turno con un build rojo.

## validate-config (espejo config↔copy↔registry)

- **`componente "x" no está registrado`** → falta la key en registry.ts. Corre
  `assemble_registry` (determinista); no lo edites a mano.
- **`namespace huérfano` / sección sin ns** → es.json tiene un ns que ningún
  `component`/`ns` del config usa, o una sección del config sin su copy. Alinea la
  key: decláralala en site.config.ts, o bórrala de es.json.
- **`key faltante en es.json`** → la custom hace `t("foo")` y no existe `foo` bajo
  su ns. Agrégala con `edit_file`.
- **`color literal en components/`** → una custom trae `#hex`/`rgb()`/`bg-blue-500`.
  Cámbialo por token semántico (bg-primary, text-foreground, border-border…).
- **`teléfono/dirección ≠ lead`** → business en site.config.ts no coincide con el
  lead. Usa el dato real (corre `compose_spec` para el andamiaje exacto).

## typecheck (tsc — lista TODO de una vez)

- **`e.map is not a function` / no-array donde se espera array** → tu config o
  es.json pasó un NO-array a una sección (`t.raw("items")`). Esa key en es.json
  debe ser `[...]`.
- **`Property 'fill'/'width'/'height' does not exist` (SmartImage)** → se los
  pasaste a SmartImage. Quítalos: hace fill por dentro, solo `className` con el aspecto.
- **`has no exported member 'X'` / named-vs-default** → registry importa un nombre
  que la custom no exporta así. Corre `assemble_registry` (detecta el export real).
- **firma de `useContactForm`** → el form usa `useContactForm(\`${ns}.form\`)`;
  revisa el ns y que es.json tenga `<ns>.form` con sus labels.

## build (next — aborta en el PRIMER error)

- **`Module not found: Can't resolve './x'`** → import a un archivo inexistente.
  El clásico: `@import "./fonts.css"` en theme.css → BÓRRALO (las fuentes van por
  next/font en app/fonts.ts). O una custom importando algo que no existe.
- **`Hydration failed` / `Text content does not match`** → una custom usa estado/
  `Date`/aleatorio en server, o anida `<p>` en `<p>`. Lee
  `.agent/skills/next-best-practices/hydration-error.md`, no adivines.

## Regla dura

Corrige TODOS los errores de un rung en UNA pasada (typecheck los lista juntos) y
re-llama `build_check`. El tope de 2 intentos aplica SOLO a errores que apunten al
MOTOR (`components/{shared,ui}/*`, `lib/*`): ahí el fix es realinear TU config al
schema, no editar motor. Un rung rojo jamás cierra tu turno ni es una pregunta.
