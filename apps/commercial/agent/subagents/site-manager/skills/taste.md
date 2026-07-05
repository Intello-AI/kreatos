---
description: Reglas de taste anti-AI-slop (destiladas de tasteskill y adaptadas al template kreatos). Aplícalas al componer el spec y córrelas como checklist final antes de save_site_version.
---

# Taste

El template controla el motor; tú controlas config, copy, theme, fuentes e
imágenes. Estas reglas viven en ESE terreno. Complementan (no sustituyen)
`anti-generic-design` y `copywriting-es`.

## Lectura de diseño (antes de decidir nada)

Antes de componer el spec, declara en una línea tu lectura del brief:
"Lo leo como: <tipo de negocio> para <audiencia>, con lenguaje <vibra>,
apoyado en el preset <X> con <variación>". La audiencia elige la estética,
no tu gusto. Un despacho fiscal que atiende corporativos ≠ una constructora
residencial. Si el brief trae referencias o colores de marca, son material de
partida obligatorio, no sugerencia.

## Tipografía

- Nunca el mismo par tipográfico que el sitio anterior del mismo giro (la
  anti-convergencia valida preset+hero+acento; tú extiende la variación al
  par de fuentes cuando haya empate).
- Serif como display solo si el giro lo justifica de verdad (editorial,
  heritage, legal premium) y puedes decir por qué EN el spec
  (variation_notes). "Se ve premium" no es razón.
- Énfasis dentro de un headline: itálica o bold de la MISMA familia. Nunca
  inyectes una palabra serif en un headline sans para "darle interés".

## Color

- Un solo acento por sitio, usado idéntico en todas las secciones. Un sitio
  gris-cálido no estrena un CTA azul en la sección 7.
- Prohibido el default "AI premium": fondos crema/beige + acentos
  latón/arcilla/ocre + texto espresso. Si el giro pide calidez, usa otra
  familia: verde profundo + hueso, negro-roto + tan, terracota + slate,
  monocromo + un acento saturado. Rota respecto al último sitio del giro.
- Nada de morados/violetas de gradiente AI. Si la marca del cliente ES
  morada, adóptala con intención (neutros armonizados, cero glow).

## Copy (se valida sobre messages/es.json)

- **Cero em-dashes (`—`) y en-dashes (`–`) en todo el copy visible.** Es el
  tell #1. Reestructura: punto, coma, dos puntos o paréntesis. Rangos con
  guion normal (2018-2026).
- Hero: headline máx ~8 palabras (2 líneas), subtexto máx 20 palabras,
  1 CTA primario + máx 1 secundario. Si no cabe la propuesta de valor en 20
  palabras, la propuesta está confusa, no la regla apretada.
- Un solo label por intención en toda la página: "Contáctanos" y "Hablemos"
  juntos = error; elige uno y úsalo en navbar, hero y cta-band.
- Números fake-precisos prohibidos: "98.7% de satisfacción" sin dato real
  del lead es invento. Solo métricas reales (rating, reseñas, años si hay
  founded).
- Testimonios: máx 3 líneas por cita, atribución nombre + rol. Si la reseña
  real es larga, recórtala.
- Nada de labels poéticos-artesanales ("Desde el terreno", "Notas de obra")
  ni humildad performativa ("Silenciosamente elegidos por..."). Labels
  funcionales y claros.
- Etiquetas pequeñas en mayúsculas sobre títulos de sección (eyebrows): máx
  1 por cada 3 secciones y NUNCA numeradas ("01 · Servicios" prohibido).
- Relee TODO el copy antes de entregarlo: cualquier frase gramaticalmente
  rota, con referente confuso o que "suena a IA tratando de ser profunda" se
  reescribe en lenguaje llano. Copy aburrido y claro > copy lindo y hueco.

## Densidad y estructura

- Cada sección: un mensaje. Headline corto + párrafo ≤25 palabras + un
  visual o CTA. Lo que no quepa, se corta o se va a una página interior.
- Listas de >5 ítems: usa la variante correcta (bordered-table, asym-grid) o
  divide en grupos; nunca una `<ul>` larga con hairline bajo cada fila.
- No repitas la misma variante de sección con el mismo rol dos veces en una
  página. Servicios y proceso no pueden verse iguales.
- Un tema por sitio (defaultMode del design): las secciones no invierten de
  claro a oscuro a media página; eso lo gobierna el theme, no lo pelees.

## Motion (animaciones)

El motor del template trae la capa de animación; tú la diriges desde
`design.motion` en site.config.ts. Reglas de dirección:

- **Elige la intensidad según la lectura de diseño, no por default**:
  `subtle` (fades y translates al entrar en viewport; el default sano para
  despachos y B2B serio), `expressive` (entrada coreografiada del hero,
  stagger en listas de servicios, reveals más notorios; para constructoras,
  agencias y marcas con carácter), `none` (solo si el brief lo pide).
- **Toda animación debe poder justificarse en una frase**: jerarquía (dirigir
  el ojo), narrativa (revelar en secuencia), feedback (responder al usuario).
  "Se ve cool" no es justificación. Un sitio con motion `expressive` sin
  motivo se ve MÁS barato que uno estático.
- **Una sola coreografía por sitio**: la misma curva, la misma dirección de
  entrada, la misma duración base. Cada sección con su propio estilo de
  animación = slop.
- **El hero es el único lugar con entrada protagonista**; el resto del sitio
  revela al scroll con la versión discreta de la misma coreografía.
- Si declaras motion `expressive`, el sitio DEBE moverse de verdad (hero +
  reveals + hover en CTAs). Motion prometido y no entregado = versión mal
  hecha; si dudas, baja a `subtle` y entrega limpio.
- `prefers-reduced-motion` lo respeta el motor siempre; no lo desactives.

## Páginas interiores (la norma, no el extra)

- Multi-página es el default de un sitio corporativo: /servicios con 3+
  servicios reales, /nosotros con cualquier material verificable (historia,
  años, fotos de la ficha), y las de giro (/proyectos, /carta, /cobertura)
  cuando el contenido existe. Un one-pager solo para negocios genuinamente
  mínimos, justificado. Página de relleno = peor que no tenerla.
- El copy de una página interior nunca duplica el de la home: la home tiene
  el teaser, la página el detalle. Mismos datos, distinta profundidad.
- Cada página interior cumple TODO este documento por sí sola (hero
  discipline aplica a su page-header: título corto, lead ≤25 palabras).

## Pre-flight (mecánico, antes de save_site_version)

Repasa y marca cada uno; si uno falla, corrige antes de guardar:

1. Lectura de diseño declarada y reflejada en variation_notes.
2. Cero `—`/`–` en es.json (búscalo literal).
3. Un solo acento, idéntico en light y dark.
4. Paleta ≠ beige+latón+espresso salvo justificación de marca explícita.
5. Hero: ≤8 palabras headline, ≤20 subtexto, ≤2 CTAs, sin micro-strips.
6. Una sola intención por label de CTA en todo el sitio.
7. Ningún número inventado; solo datos del lead.
8. Eyebrows ≤ ceil(secciones/3), ninguno numerado.
9. Citas ≤3 líneas con atribución completa.
10. Ninguna página interior de relleno; copy interior ≠ copy de la home.
11. Par tipográfico y paleta distintos al último sitio del mismo giro.
12. `design.motion` elegido con razón escrita en variation_notes; si es
    `expressive`, el hero y los reveals realmente lo entregan.
