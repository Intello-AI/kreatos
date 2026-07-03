---
description: Usa este playbook antes de guardar leads para decidir qué negocios califican como buen lead y cuáles descartar.
---

# Criterios de calificación de leads

Un lead es una empresa a la que podríamos venderle un sitio **corporativo e
informativo** (quiénes somos, servicios, portafolio, contacto) — sitio nuevo si no
tiene, o rediseño si ya tiene uno (`website` con valor). Este playbook decide cuáles
candidatos de `search_businesses` valen la pena guardar.

## Buen lead (guárdalo)

- **Tiene señales de actividad**: rating presente y al menos ~5 reseñas
  (`reviewsCount >= 5`). Un negocio con reseñas recientes está operando.
- **Es una empresa de perfil corporativo/profesional**: despachos contables, jurídicos
  y de arquitectura, constructoras, inmobiliarias, empresas de logística y transporte,
  manufactura y maquila, distribuidores y mayoristas, agencias de seguros y aduanales,
  consultorías, empresas de mantenimiento industrial, talleres mecánicos industriales,
  proveedores B2B.
- **Tiene datos de contacto utilizables**: idealmente teléfono y dirección presentes.
  Sin teléfono no hay forma de contactarlo en etapas posteriores; guárdalo solo si lo
  demás es fuerte.
- **Con o sin sitio web**: ambos califican. Sin sitio = candidato a sitio nuevo; con
  sitio = candidato a rediseño/mejora. No descartes un negocio solo por tener sitio.

## Mal lead (descártalo)

- **Negocios que necesitan reservas, citas o pedidos en línea**: restaurantes,
  cafeterías, bares, estéticas y salones de belleza, barberías, spas, gimnasios,
  clínicas y consultorios con agenda de citas, hoteles. Su sitio no sería corporativo
  informativo sino un sistema de reservas, y eso está fuera de nuestro servicio.
- **Cadenas y franquicias** (OXXO, bancos, marcas nacionales): la decisión de web no es
  local.
- **Sin ninguna reseña ni rating**: probablemente inactivo, duplicado o recién dado de
  alta en Maps.
- **Categorías no atendibles**: dependencias de gobierno, iglesias, escuelas públicas,
  cajeros, paradas de transporte.

## Zona gris

- Pocas reseñas (1–4) pero con teléfono y dirección completos: guárdalo.
- Rating muy bajo (< 3.0) con muchas reseñas: negocio activo pero con mala reputación;
  guárdalo — un sitio web puede ser parte de su recuperación.
