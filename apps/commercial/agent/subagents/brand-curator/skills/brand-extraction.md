---
description: Criterio de diseñador para curar la identidad de un lead — elegir el logo/isotipo, mapear la paleta a tokens y curar las fotos. Cárgalo antes de decidir qué promover a la ficha.
---

# Extracción de marca (criterio de diseñador)

Tu ficha alimenta al site-builder. Un logo malo o una paleta mal leída se
propagan a todo el sitio. Decide con estas reglas y di el porqué en una frase.

## Logo / isotipo — qué promover

Jerarquía de calidad (de mejor a peor), a igualdad de que SEA la marca:
1. **Vectorial (SVG)** — escala infinito, el ideal. Si hay SVG del logo, gana.
2. **Raster con fondo TRANSPARENTE** (PNG/WebP) y buena resolución (≥512px lado).
3. **Raster con fondo blanco/color** — usable pero segundo; el motor no lo recorta.
- **isotipo** = símbolo/marca CUADRADA (favicon/app-icon) → `iconSourcePath`. De él
  el motor genera favicon + apple-icon. Un **wordmark** horizontal NO sirve de icono.
- **logo** del header = el que trae el nombre (wordmark) o el isotipo + shortName.

**PLACEHOLDERS — nunca los promuevas** (`analyze_brand_image` los marca):
la "C" de Canva, el logo de Wix/Squarespace/WordPress/GoDaddy, el ícono genérico
de "documento/mundo" del navegador, un favicon default. Un favicon scrapeado a
menudo es la HERRAMIENTA con que hicieron el sitio, no la marca. Ante la duda,
escala a la verificación de world-knowledge (lo hace la tool) y NO lo bendigas.

Si no hay ningún logo usable, dilo explícito en las notas — el motor cae al
monograma con la inicial; no inventes ni promuevas basura como logo.

## Paleta → tokens

- El **color PROTAGONISTA** de la marca (el que más la identifica, no el más
  frecuente en píxeles) → `primary`. El dominante va PRIMERO en `colors`.
- Señales duras > adivinar: `theme-color` del `<head>` y los custom props
  (`--primary`, `--brand`, `--accent`) del CSS (usa `extract_css_palette`) son el
  color DECLARADO por la marca — mandan sobre lo que estimes de un screenshot.
- Mapea al sistema funcional: `background` (fondo dominante, casi siempre claro),
  `foreground` (texto), `primary` (acento de marca), `muted-foreground`, `border`.
- Guarda los HEX en `colors` (dominante primero); el site-builder los refina a
  la medida (el sitio viejo suele tener el hue correcto mal ejecutado).
- Ignora colores de chrome del navegador/CSS reset (grises de sistema, #fff/#000
  puros de bordes) al elegir el acento — busca el color con INTENCIÓN de marca.

## Curaduría de fotos

- **Reales del negocio > stock.** Una obra/oficina/equipo reales venden; el stock
  genérico (gente sonriendo con casco) resta. Descarta el stock salvo que no haya nada.
- Clasifica el `use` de cada una: **hero** (la más potente, apaisada), **equipo**
  (retratos/grupo), **portafolio** (trabajos/productos), **oficina/instalaciones**.
- **Retratos con banda de nombre/cargo**: captura `person` + `role` (de
  `analyze_brand_image`) — el site-builder los nombra y coloca sin re-visionar.
- Descarta: borrosas, con watermark ajeno, capturas de baja resolución, logos de
  terceros, y cualquier imagen que no sea del negocio.
- Pasa `imageDescriptions` 1:1 con `imagePaths`: es el mapa que le ahorra al
  site-builder re-ver cada foto.

## Fuentes

`scrape_brand_site` devuelve `fonts` (Google Fonts + @font-face del sitio) — la
tipografía REAL de la marca. Guárdala en `save_brand_profile.fonts`: es
REFERENCIA para el site-builder (no mandato; en un rediseño puede variar el par
si el giro lo pide), no la pierdas en una nota.
