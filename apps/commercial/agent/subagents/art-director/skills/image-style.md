---
description: Estrategia de imágenes — un treatment por sitio, queries específicas, qué stock está prohibido. Úsalo al definir images en el spec.
---
<!-- ESPEJO: copia idéntica en art-director/ y site-builder/skills/image-style.md. Si editas una, edita la otra. -->

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
- Registra en el changelog qué fotos son reales del cliente para que
  site-builder no las trate.
- Preferir **detalle, textura y lugar** sobre personas: manos sobre planos,
  estructura de acero a contraluz, estantería de almacén, documentos y sello,
  camión en carretera al amanecer.
- Toda imagen lleva `alt` descriptivo en español.

## Logo del negocio (NO lo derives ni lo repurposes)

`fetch_brand_assets` baja el logo tal cual a `public/images/logo.<ext>` (y el
isotipo a `icon.<ext>`). Úsalo ASÍ:

- **`business.logo` apunta al `logo.<ext>` descargado, SIN convertirlo.**
  NUNCA lo re-generes a `.webp`/`.jpg` con ffmpeg para el navbar: la conversión
  APLANA la transparencia sobre negro y deja una **caja negra** alrededor del
  logo (pasó en HR Transportes: el navbar mostró el logo enmarcado en un cuadro
  negro). El PNG transparente original se ve limpio sobre cualquier fondo.
- Si el logo es oscuro y el theme es dark (o al revés) y queda invisible, NO lo
  encajones en un color: es un problema de contraste del logo — déjalo tal cual
  (el navbar tiene su propio fondo al hacer scroll) o usa el isotipo `icon` si
  contrasta mejor. Encuadrar en negro NO lo resuelve y se ve peor.
- **El logo y el isotipo son de MARCA (navbar, footer, favicon), JAMÁS imágenes
  de contenido de una sección.** No pongas el logo ni una letra/monograma del
  negocio como la imagen de un `about`, `hero` o bloque (en HR salió un "HRT"
  gigante sobre negro llenando la columna de la sección). Las imágenes de
  sección salen de `brand-N` (fotos reales) o stock del giro con treatment.

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
