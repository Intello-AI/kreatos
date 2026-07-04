---
description: Checklist final antes del push — autoevaluación del build y del qa-report. Si algo reprueba, itera antes de push_site_version.
---

# Checklist de calidad (antes del push)

Corre `pnpm qa` y lee `.qa/qa-report.json`. Luego respóndete esto con honestidad;
"más o menos" = reprueba:

## Gates automáticos (del qa-report)

1. `pnpm typecheck`, `pnpm lint` y `pnpm build` verdes.
2. validate-config sin errores: zod pasa, sin lorem/TODO/emoji, sin keys
   huérfanas en `es.json`, teléfono y dirección == datos del lead, cero colores
   literales en `components/`.

## Autoevaluación de diseño

3. ¿Cuál es el **gesto memorable** de este sitio? Nómbralo. Si no puedes, no hay.
4. ¿La jerarquía es obvia en 2 segundos (qué es, dónde, qué hacer)?
5. ¿El dark mode se ve **diseñado** (paleta propia) y no invertido?
6. ¿Un diseñador diría "agencia" o "plantilla"? Revisa contra
   `anti-generic-design` prohibición por prohibición.
7. ¿El copy suena a este negocio y ciudad, con datos reales visibles?
8. ¿Las imágenes comparten un solo treatment y ninguna es stock prohibido?
9. ¿Se cumplió lo que pedía el brief y `site_instructions`?

## Reglas

- Cualquier "no" → corrige y repite el gate correspondiente. Máximo 2 ciclos de
  corrección de diseño; si algo no se puede cumplir (p. ej. no hay reseñas para
  testimonials), ajusta el spec (nueva versión con changelog) en vez de forzarlo.
- Guarda el reporte con `save_qa_report` ANTES de `push_site_version`.
