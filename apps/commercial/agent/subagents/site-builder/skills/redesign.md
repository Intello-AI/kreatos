---
description: Flujo extra cuando el lead YA tiene sitio (lead.website != null) — qué extraer del sitio viejo, qué conservar y qué jamás conservar.
---

# Rediseños

Si `lead.website` existe, el sitio es un rediseño. Antes de componer el spec,
analiza el sitio actual (fetch del HTML desde el sandbox con `curl` si hace falta).

## Qué extraer del sitio viejo

- **Logo**: `<link rel="icon">`, `og:image`, o el `<img>` del header. Referencia
  su URL en el spec (`redesign.keep.logoPath`).
- **Hues de marca**: 1–2 colores dominantes del logo/CSS. Son **input** de la
  paleta que diseñas a la medida — refínalos al componer la paleta (el sitio
  viejo suele tener el hue correcto mal ejecutado), no los copies tal cual.
- **Hechos reales**: años en el mercado, certificaciones, marcas que distribuye,
  clientes, sucursales, servicios que hoy lista. Van a `redesign.keep.facts` y
  alimentan el copy.
- **SEO existente**: title/description actuales y rutas indexadas →
  `redesign.keep.slugsToRedirect` para el plan de redirects si migran dominio.

## En el spec

`mode: "redesign"` + bloque `redesign` con `oldUrl`, `keep` (lo de arriba),
`improve` (3–5 fallas concretas del sitio viejo: jerarquía, contacto invisible,
no responsive...) y `critique` (3–5 líneas — esta crítica es munición directa
para proposal/outreach al vender el rediseño).

## Reglas

- **Se conserva**: identidad (logo, hue de marca refinado), hechos, continuidad SEO.
- **Jamás se conserva**: layout, tipografía, ni el stock del sitio viejo.
- El resultado debe ganarle al sitio viejo en todo lo listado en `improve` — si
  no puedes articular por qué el nuevo es mejor, el spec no está listo.
