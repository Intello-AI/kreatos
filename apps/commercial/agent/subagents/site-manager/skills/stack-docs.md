---
description: Dónde vive la documentación curada del stack (Next 16, shadcn, Tailwind v4) dentro del repo clonado y cuándo leer cada pieza. Cárgala al empezar la fase build si vas a escribir secciones custom o tocar theme.css.
---

# Docs del stack en el repo

El template trae documentación curada del stack en `.agent/skills/` (dentro de
`/workspace/site` una vez clonado). Léela con `read_file` ANTES de escribir
código en el terreno que toque — es la diferencia entre adivinar la API y
usarla bien:

## `.agent/skills/next-best-practices/`
- `rsc-boundaries.md` + `directives.md` — OBLIGATORIAS antes de escribir una
  sección custom: server component por default, dónde va `"use client"`, qué
  no puede cruzar la frontera.
- `image.md` / `font.md` — al declarar imágenes o tocar `app/fonts.ts`.
- `hydration-error.md` — si `pnpm build` o el runtime reporta hydration
  mismatch: diagnóstico directo, no pruebes a ciegas.
- `metadata.md` — si tocas SEO de páginas interiores.

## `.agent/skills/shadcn/`
- `rules/composition.md` + `rules/styling.md` — antes de componer con
  `components/ui/`: cómo se extiende un componente shadcn sin pelearse con él.
- `rules/forms.md` — si la sección custom lleva formulario.
- `rules/icons.md` — convenciones de iconos (lucide, un solo family).
- `customization.md` — variantes con cva y cuándo crear una.

## `.agent/skills/tailwind-v4-shadcn/`
- `SKILL.md` — sintaxis Tailwind v4 (`@theme`, tokens CSS-first): léela antes
  de tocar `app/theme.css`.
- `references/dark-mode.md` — al ajustar el bloque `.dark`.
- `references/common-gotchas.md` — si una clase "no funciona": casi seguro
  está aquí el porqué.

Regla: si el error o la duda es del stack (Next/shadcn/Tailwind), primero
lee la doc correspondiente; después corrige. Máximo 2 intentos a ciegas está
prohibido — con docs a la mano, ninguno.
