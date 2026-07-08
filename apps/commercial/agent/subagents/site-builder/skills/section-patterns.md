---
description: Recetario de secciones por giro — qué arquetipos usar, en qué orden, y cuáles omitir. Úsalo al definir las sections custom del spec.
---

# Patrones de secciones por giro

TODA sección es `custom` (`{ id: "custom", component: "<kebab>", ns: "<kebab>", why }`).
No hay ids de motor ni variantes cerradas: TÚ compones cada layout a la medida de
ESTE negocio — inventándolo, o PARTIENDO de un componente de `reference/` que copias
a `components/custom/` y ADAPTAS (marca, copy/ns, contenido, estructura).
`reference/blocks/` es hoy una biblioteca GRANDE (~530 patrones) agrupada POR
FAMILIA en `reference/blocks/catalog.md` (heroes, cifras, galerías, precios,
reseñas, proceso, contacto, footers, catálogo, hospitality, inmobiliaria, salud…);
cada fila trae el arquetipo + la forma del `ns`. Ojea la familia que tu sección
necesita, roba composición/técnica y DIVERGE. Este recetario da ARQUETIPOS (moldes
de composición) y un orden de arranque — punto de partida del que DIVERGES, nunca
una plantilla a clonar. Adaptar ≠ pegar verbatim:
dos sitios jamás quedan idénticos. El orden en `spec.sections` es el orden de
render. Menos secciones bien resueltas ganan a muchas a medias.

## Header, footer y contacto — customs con su plomería

- El **header** y el **footer** son dos customs (`slot: "header"` / `slot: "footer"`);
  el motor los envuelve en sus landmarks e inyecta el crédito de agencia. A lo más
  uno de cada.
- El **contacto** es un custom con el formulario headless (`useContactForm`) y, si
  aplica, `MapEmbed`. De él dependen SEO, accesibilidad y el form real: siempre
  existe, al final de la home (y como página `/contacto` cuando el brief la pida).
- El **aviso de privacidad** lo genera el motor: no lo compongas.

## Paleta de ARQUETIPOS (el molde de cada sección)

A CADA sección custom asígnale UN arquetipo estructural y dilo en su `why`. No
repitas el mismo arquetipo más de 2 veces por sitio:

- **hero** — el gesto de entrada: masthead editorial (titular dominante), split
  asimétrico 60/40 (texto + imagen o tarjeta flotante), foto a sangre + overlay
  (texto claro), o stat-led (cifras protagonistas). Con foto real de marca, el hero
  con imagen es el más distinto de una plantilla.
- **stat-wall** — banda de cifras enormes (años, m², MW, cobertura); rompe el ritmo.
- **services-ledger** — servicios como ledger de líneas finas con numerales grandes,
  NUNCA grid de 3 cards idénticas (icono + título + párrafo).
- **feature-zigzag** — bloques alternos imagen izquierda/derecha, uno por diferenciador.
- **bento/mosaico** — celdas de tamaños distintos (portafolio, proyectos).
- **timeline / pasos** — proceso o historia con numerales grandes.
- **band-fullbleed** — banda de color sólido o foto + overlay (clientes, seguridad,
  cierre CTA). El acento con avaricia, nunca como fondo de sección completa salvo la banda.
- **lista / acordeón editorial** — FAQ o especialidades; el peso en la tipografía y
  las reglas finas, no en tarjetas.

## Recetas base por giro (andamio — DIVERGE de ellas)

Arranque, no molde. El defecto #1 que reporta el humano: "todos los sitios salen
iguales". Cambia el ORDEN, el arquetipo del hero y la firma respecto a los sitios
recientes del giro (el gate `save_site_version` valida la convergencia de TONO de
`primary`/`accent`, con excepción brand-anchored):

- **Despacho contable/legal**: hero editorial → stat-wall (años/cartera) →
  services-ledger (5-6) → about (retrato o narrativa) → FAQ fiscal/legal real →
  band CTA → contacto. Registro `usted`, mucho aire.
- **Constructora**: hero foto-a-sangre de obra → stat-wall (m²/años/proyectos) →
  services-ledger o zigzag → bento de proyectos → pasos de proceso → band de
  clientes/seguridad → CTA → contacto.
- **Logística/transporte**: hero split o stat-led → stat-wall → services →
  cobertura (zonas/rutas, OBLIGATORIA en este giro) → proceso → FAQ → contacto.
- **Distribuidor/mayorista**: hero split → stat-wall → services-ledger tipo
  catálogo → cobertura (reparto) → FAQ → CTA → contacto.
- **Consultoría/premium**: hero stat-led asimétrico → services-ledger → about
  retrato/timeline → CTA → contacto. Pocas secciones, mucho aire.

## Ritmo — lo que evita el sitio-plantilla

El defecto que más abarata un sitio: todas las secciones con el MISMO molde (eyebrow
+ título + grid con bordes). Alterna arquetipo, densidad (aireado vs compacto) y
fondo (`background` / `card` / `secondary` / banda `primary`) entre secciones vecinas.
La **firma custom** (1-2) es donde más peleas la mismidad: un gesto que ningún otro
sitio tenga, con composición robada de una referencia del brief y materializada a la
medida de ESTE negocio. Un `why` debe leerse como "va como <arquetipo> porque <razón>".

## Omisión (criterio de DEMO — ver skill demo-selling)

- **Portafolio sin fotos del cliente** → SÍ, con stock del giro + treatment del sitio
  y títulos plausibles marcados como ilustrativos en el changelog. Nunca stock crudo.
- **Logos de clientes** → banda de rectángulos tipográficos (monogramas/nombres en la
  display, tono muted) con eyebrow "Empresas que confían". Nunca cajas con "LOGO".
- **Testimonials** → SOLO reseñas de Google reales (texto del lead). Sin citas usables
  o `reviews_count < 5`: la sección NO existe (citas/nombres inventados = línea dura).
- **Proceso**: fuera en despachos salvo que el brief lo pida.
- **Contacto** siempre al final, con mapa si la ubicación importa (`showMap: false`
  para negocios que trabajan a domicilio).
