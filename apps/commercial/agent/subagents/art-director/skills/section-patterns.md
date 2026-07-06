---
description: Recetario de secciones por giro — cuáles usar, en qué orden, con qué variante, y cuáles omitir. Úsalo al definir sections en el spec.
---

# Patrones de secciones por giro

El orden en `spec.sections` es el orden de render. Menos secciones bien resueltas
ganan a muchas a medias.

## Catálogo del MOTOR y su escape hatch (lee esto ANTES de componer sections)

Cada `id` de sección del motor tiene un LAYOUT FIJO y un set CERRADO de
variantes. site-builder NO puede reestilizar un id del motor más allá de sus
variantes: si tú especificas un layout que el id no soporta, la única salida
que le queda es EDITAR el motor —está prohibido y tumba la corrida entera—.
Si lo que la dirección de arte pide no cabe en el catálogo, va como `custom`.

Catálogo exacto (id → variantes soportadas; nada fuera de esto existe):

- `navbar` → minimal | split | centered-logo
- `hero` → editorial | split-image | full-bleed | stat-led (+ `image`)
- `trust-bar` → layout único (sin variante)
- `services` → numbered-list | asym-grid | bordered-table (+ `count`)
- `about` → portrait | timeline | plain (+ `image`)
- `process` → layout único (+ `count`)
- `portfolio` → masonry | rows (+ `images`)
- `coverage` → layout único
- `testimonials` → layout único (+ `count`)
- `faq` → layout único (+ `count`)
- `cta-band` → layout único
- `contact` → layout único (solo toggle `showMap`; NO tiene variante de
  "footer-hero"/"segundo hero"/oscuro — ese layout NO existe en el motor)
- `footer` → layout único
- `page-header` → solo en páginas interiores
- `custom` → `{ id: "custom", component: "<kebab>", ns: "<kebab>" }` — layout
  que TÚ inventas; site-builder lo escribe desde cero en components/custom/.

**Regla dura del escape hatch:** cualquier layout que el catálogo de arriba
NO exprese va como `custom`, con su `component`, su `ns` y su `why`. Ejemplos
que SON custom (no reestilizar un id del motor): hero partido con mapa+flota
que una variante `hero` no logra, bloque de contacto tipo "segundo hero"
oscuro (el `contact` del motor es claro y fijo), banda de logos de clientes,
tabla de flota, timeline de cobertura con mapa. Si dudas si un layout cabe en
una variante: NO cabe → custom.

**Las commodity se quedan SIEMPRE en el motor** (navbar, footer, contact, faq,
trust-bar, aviso de privacidad): de ellas dependen SEO, accesibilidad y el
formulario. Si el concepto pide drama visual en el cierre de la home, NO
reestilices `contact`: especifica una `custom` (p. ej. `contact-hero`) para el
gesto visual y CONSERVA además el `contact`/`footer` del motor para el
formulario real y el SEO. Nunca describas una commodity haciendo algo que su
layout fijo no hace.

## Las recetas son PUNTO DE PARTIDA, no plantilla (lee esto primero)

El defecto #1 que reporta el humano: **todos los sitios salen iguales** —
mismo hero, mismo header, misma secuencia. Eso NO es una regla del sistema,
es pereza. Las recetas de abajo son un ANDAMIO para no arrancar en blanco;
tu trabajo es DIVERGIR de ellas según ESTE negocio. Reglas duras de divergencia
(el gate las valida contra los sitios recientes del mismo giro):

- **Varía el HERO.** No default a `editorial` siempre. Elige la variante por lo
  que le queda al negocio y por lo que NO usaron los sitios recientes del giro:
  `full-bleed` (foto a sangre + overlay — el más distinto, úsalo cuando haya
  buena foto), `stat-led` (cifras protagonistas), `split-image` (imagen al lado),
  `editorial` (titular dominante). Dos sitios del mismo giro NO llevan el mismo
  hero variant.
- **Varía el NAVBAR.** `minimal` / `split` / `centered-logo` — no siempre `split`.
  El header puede y debe verse distinto entre sitios.
- **Al menos UN momento con imagen protagonista** cuando la marca tiene fotos:
  hero `full-bleed`, o un bloque de fondo con imagen (`image-fullbleed-caption`,
  o una `custom` con imagen de fondo + overlay). Un sitio 100% tipografía-sobre-
  fondo-plano se lee a plantilla. El fondo con imagen es un recurso, úsalo.
- **Rompe la secuencia.** Cambia el ORDEN respecto a la receta y respecto a otros
  sitios del giro: mete la firma custom en una posición distinta, alterna qué va
  después del hero (a veces stats, a veces manifiesto, a veces banda de imagen).
- **La FIRMA custom (1-2) es donde más peleas la mismidad**: dale a este negocio
  un gesto que ningún otro sitio tenga (composición robada de una referencia).

Si dos sitios del mismo giro comparten hero variant + navbar variant + secuencia,
fallaste — el gate `save_site_version` rechaza la convergencia.

## Recetas base (andamio — DIVERGE de ellas)

- **Despacho contable/legal**: hero `editorial` → trust-bar →
  services `numbered-list` (5–6) → about `plain` → testimonials → faq (5, fiscal/
  legal real) → cta-band → contact.
- **Constructora**: hero `full-bleed` (foto de obra + duotone) →
  trust-bar (m², años, proyectos) → services `asym-grid` → portfolio `rows` →
  process (4–5 pasos) → testimonials → cta-band → contact.
- **Logística/transporte**: hero `split-image` o `stat-led` → trust-bar →
  services → coverage (zonas/rutas — obligatoria en este giro) → process →
  testimonials → faq → contact.
- **Distribuidor/mayorista**: hero `split-image` → trust-bar →
  services `bordered-table` (líneas de producto tipo catálogo) → about →
  coverage (zonas de reparto) → faq → cta-band → contact.
- **Consultoría/premium**: hero `stat-led` asimétrico → services
  `numbered-list` → about `portrait` o `timeline` → testimonials → cta-band →
  contact. Pocas secciones, mucho aire.

## Diversidad de arquetipo — lo que evita el sitio-plantilla

El defecto que más abarata un sitio: todas las secciones con el MISMO molde
(eyebrow + título + grid con bordes). Al componer el spec, a CADA sección
custom asígnale un ARQUETIPO estructural distinto y descríbelo en su `why` /
descripción para que site-builder no las haga todas iguales. No repitas el
mismo arquetipo más de 2 veces en un sitio. Paleta de arquetipos: split 60/40
asimétrico, tabla/ledger de líneas finas, timeline/pasos numerados, banda
full-bleed de color sólido, feature alterno zig-zag (imagen izq/der), mosaico/
bento de celdas de tamaños distintos, stat wall (cifras enormes), lista/
acordeón editorial. Alterna también densidad (aireado vs compacto) y fondo
(background/card/secondary) entre secciones vecinas: el RITMO es lo que hace
que dos negocios distintos no salgan iguales. Un `why` de sección debe poder
leerse como "esta va como <arquetipo> porque <razón>", no solo "grid de X".

## Reglas de omisión (criterio de DEMO — ver skill demo-selling)

El preview es una maqueta de venta: una sección que le muestra al cliente
algo que va a QUERER existe aunque falte el material, con placeholder
DISEÑADO; una que puede leerse como hecho falso, no.

- **Portfolio sin fotos del cliente** → SÍ con stock del giro + treatment
  del sitio y títulos plausibles marcados como ilustrativos en el changelog
  (el cliente ve cómo se vería su obra). Nunca stock sin treatment.
- **Logos de clientes** → SÍ como banda de rectángulos tipográficos
  elegantes (monogramas/nombres genéricos en la display, tono muted) con
  eyebrow tipo "Empresas que confían". Nunca cajas punteadas con "LOGO".
- **Testimonials** → SOLO reseñas de Google reales (texto del lead o sus
  reseñas). Sin citas usables o `reviews_count < 5`: la sección NO existe —
  citas y nombres inventados son la línea dura, jamás.
- **Sin process** en despachos salvo que el brief lo pida.
- contact siempre al final, con mapa si la ubicación importa para el negocio
  (`showMap: false` para negocios que trabajan a domicilio).
