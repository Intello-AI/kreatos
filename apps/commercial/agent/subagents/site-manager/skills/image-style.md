---
description: Estrategia de imágenes — un treatment por sitio, queries específicas, qué stock está prohibido. Úsalo al definir images en el spec.
---

# Imágenes

Cuando el sitio usa STOCK, el treatment (overlay CSS con la paleta) da la
coherencia. Cuando usa FOTOS REALES del cliente, el treatment las ARRUINA.

## Regla de oro: la foto real del cliente manda, no el filtro

- **Si el sitio usa fotos reales del cliente (scrape de su web, material que
  entregó): `design.imageTreatment: "none"`.** Sin filtro. Un duotono rojo/
  ámbar sobre la foto de su flota o su obra la tiñe de rosa y se ve peor que
  la original — el cliente reconoce sus fotos y las quiere tal cual. Esto
  aplica aunque la paleta del sitio sea muy marcada: las fotos reales NO se
  someten al acento.
- **`duotone-accent`/`bw`/`warm` son SOLO para sitios cuyo material es
  íntegramente STOCK** (el cliente no dio fotos): ahí el treatment unifica
  stock disímil y lo amarra a la marca. Aun así, prefiere `bw` o un duotono
  SUTIL cuando el acento es un color cálido saturado (rojo, naranja, ámbar):
  `duotone-accent` empuja los medios tonos hacia el acento y sobre fotos con
  piel/metal/cielo produce un tinte rosado desagradable.
- **Caso mixto (fotos reales + algo de stock): treatment `none` para todo el
  sitio.** Más vale un stock crudo bien elegido que una foto real tiñada.
  Nunca sacrifiques las fotos reales por unificar el stock.
- Registra en el spec (`design.variation_notes` o el changelog) qué fotos son
  reales del cliente para que site-builder no las trate.
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
