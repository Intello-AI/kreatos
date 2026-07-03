---
description: Usa este playbook antes de guardar leads para decidir qué negocios califican como buen lead y cuáles descartar.
---

# Criterios de calificación de leads

Un lead es un negocio local sin sitio web al que podríamos venderle uno. La herramienta
`search_businesses` ya garantiza que no tienen `websiteUri`; este playbook decide cuáles
de esos valen la pena guardar.

## Buen lead (guárdalo)

- **Tiene señales de actividad**: rating presente y al menos ~5 reseñas
  (`reviewsCount >= 5`). Un negocio con reseñas recientes está operando.
- **Es un negocio local atendible**: categorías como restaurantes, cafeterías,
  estéticas y salones de belleza, barberías, talleres mecánicos, clínicas y
  consultorios (dentales, veterinarias), gimnasios, papelerías, florerías, tiendas
  de barrio con mostrador.
- **Tiene datos de contacto utilizables**: idealmente teléfono y dirección presentes.
  Sin teléfono no hay forma de contactarlo en etapas posteriores; guárdalo solo si lo
  demás es fuerte.

## Mal lead (descártalo)

- **Cadenas y franquicias** (OXXO, bancos, marcas nacionales): la decisión de web no es
  local.
- **Sin ninguna reseña ni rating**: probablemente inactivo, duplicado o recién dado de
  alta en Maps.
- **Categorías no atendibles**: dependencias de gobierno, iglesias, escuelas públicas,
  cajeros, paradas de transporte.

## Zona gris

- Pocas reseñas (1–4) pero con teléfono y dirección completos: guárdalo, márcalo mentalmente
  como calidad media en tu resumen.
- Rating muy bajo (< 3.0) con muchas reseñas: negocio activo pero con mala reputación;
  guárdalo — un sitio web puede ser parte de su recuperación.

Cuando descartes leads por estos criterios, di cuántos y por qué regla en tu resumen final.
