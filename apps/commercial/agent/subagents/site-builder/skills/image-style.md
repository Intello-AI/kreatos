---
description: Estrategia de imágenes — un treatment por sitio, queries específicas, qué stock está prohibido. Úsalo al definir images en el spec.
---

# Imágenes

La v1 usa stock; que no se note. El 80% de la coherencia la pone el **treatment**
(overlay CSS con la paleta del sitio), no la foto.

## Reglas

- **Un solo treatment por sitio**, definido en `design.imageTreatment`:
  `duotone-accent` (cantera, ruta), `bw` (obsidiana, norte), `warm` (bodega),
  `none` solo con fotos reales del cliente.
- Preferir **detalle, textura y lugar** sobre personas: manos sobre planos,
  estructura de acero a contraluz, estantería de almacén, documentos y sello,
  camión en carretera al amanecer.
- Toda imagen lleva `alt` descriptivo en español.

## Prohibido

- Apretones de manos. Call centers con diadema. Equipos sonriendo a cámara en
  oficina genérica. Señores de traje señalando gráficas. Fotos con marca de agua.
- Fotos que contradigan el giro o la región (rascacielos de Manhattan para una
  constructora de Torreón).

## Fuentes (en orden)

1. **Biblioteca curada de kreatos** (`stock_images` en BDD / bucket `stock/`):
   fuente default cuando el giro está cubierto.
2. **Búsqueda stock** (Pexels): queries específicas en inglés, sustantivo +
   contexto + luz — "steel structure construction backlit", "warehouse shelves
   forklift natural light", "accounting documents desk close up". Nunca
   "business team" ni "construction workers smiling". Elige entre varias
   candidatas la que aguante el treatment.
3. **OG image y favicon**: SIEMPRE generados por el template (ImageResponse con
   paleta y tipografía) — cero stock ahí.
