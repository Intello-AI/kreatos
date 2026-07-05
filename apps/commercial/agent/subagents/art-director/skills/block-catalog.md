---
description: "Catálogo de la BIBLIOTECA DE BLOQUES del motor (30 arquetipos) — secciones curadas que compones eligiendo (no escribes .tsx). Léela al armar sections del spec: elige bloques variados para el reparto de apoyo y alterna hermanos; recuerda que cada sitio ademas lleva 1-2 custom de firma. Trae el arquetipo y la forma del ns de cada bloque."
---

# Catálogo de bloques (biblioteca del motor)

Bloques curados de arquetipos DISTINTOS. El agente los COMPONE: declara
\`{ id: "block", block: "<key>", ns: "<namespace>" }\` en site.config.ts y llena
el copy en messages/es.json con la forma \`ns\` indicada. NO se escribe .tsx.

**Reglas:** no repitas un bloque >2 veces; ALTERNA arquetipos vecinos
(denso/aireado, oscuro/claro, cifras/lista); hay 2-3 HERMANOS por arquetipo
(features, servicios, procesos, galerías, stats, CTAs, FAQs) — elige distinto por
sitio para que dos no se vean iguales. Los bloques son el REPARTO DE APOYO: cada
sitio ademas lleva 1-2 secciones \`custom\` de firma (obligatorias). Bloques con
imagen leen la ruta del copy; los de \`data-demo\` son placeholders.

| block (key) | arquetipo · úsalo para | forma del \`ns\` |
| --- | --- | --- |
| `about-split-metrics` | about-split-metrics — sobre-nosotros a dos columnas (imagen real izquierda + relato con 2 párrafos y fila de 3 métricas); úsalo para presentar la empresa con prueba cuantitativa sin caer en grid de tarjetas. | { eyebrow, title, body: [string], metrics: [{ value, label }], image, imageAlt } |
| `banner-statement` | Banda-manifiesto full-bleed de color sólido con una sola declaración grande centrada + label chico — úsalo para separar el sitio con una afirmación de marca de alto impacto entre secciones. | { statement, label? } |
| `bento-grid` | bento-grid — mosaico asimétrico (una celda grande 2x2 + celdas 1x1) con bordes finos; úsalo para resumir capacidades/pilares con jerarquía visual en vez de un grid de tarjetas iguales. | { eyebrow, title, cells: [{ title, description, wide? }] } |
| `comparison-table` | comparison-table — tabla comparativa "con nosotros vs sin nosotros" / capacidades; úsalo para contrastar tu propuesta contra la alternativa o listar diferenciadores en filas etiquetadas. | { eyebrow, title, columns: [string], rows: [{ label, values: [string] }] } |
| `coverage-zones` | coverage-zones — Grilla de zonas de cobertura con pin de mapa, nombre y detalle. Úsalo para mostrar el área de servicio en logística, distribución o reparto (distinto de la sección coverage del motor). | { eyebrow, title, intro?, zones: [{ name, detail }] } |
| `cta-inline-slim` | CTA slim inline (fila compacta titular izq. + botón der. sobre bg-card con border-y) — úsalo como cierre discreto entre secciones densas, sin robar peso al split-cta principal. | { title, description, cta: { label, href } } |
| `faq-columns` | faq-columns — FAQ en dos columnas sin acordeón, pares pregunta/respuesta siempre abiertos; úsalo para páginas con muchas dudas frecuentes donde quieres que todo sea escaneable de un vistazo (distinto del faq-editorial de una sola columna). | { eyebrow, title, items: [{ question, answer }] } |
| `faq-editorial` | FAQ editorial (acordeón nativo <details>, encabezado sticky a la izquierda) — úsalo para resolver objeciones frecuentes sin JS, con aire y jerarquía tipográfica fuerte. | { eyebrow, title, items: [{ question, answer }] } |
| `feature-alternating-list` | feature-alternating-list — lista editorial numerada con columna izquierda sticky; úsalo para desglosar capacidades, diferenciadores o pilares de servicio en prosa jerárquica (sin imágenes). | { eyebrow, title, intro?, items: [{ title, text }] } |
| `feature-cards-icon` | feature-cards-icon — grid asimétrico de features con icono lucide, título y texto; úsalo para presentar 3-6 capacidades/servicios con jerarquía y aire, no un grid genérico de tarjetas iguales. | { eyebrow, title, features: [{ icon, title, description }] } |
| `feature-split-sticky` | feature-split-sticky — feature protagónico editorial a dos columnas con media sticky; úsalo para destacar UNA capacidad clave con narrativa larga y lista de sub-puntos, no un grid de features iguales. | { eyebrow, title, body, points: [string], image, imageAlt } |
| `feature-zigzag` | filas alternando imagen izq/der, con aire; 2-4 servicios/pilares con foto real | { eyebrow, title, intro?, features: [{ title, description, image, imageAlt }] }
| `gallery-masonry` | gallery-masonry — galería masonry (columns CSS, alturas variadas) con caption opcional; úsalo para mostrar obra, portafolio fotográfico o showroom sin caer en un grid uniforme | { eyebrow, title, images: [{ src, alt, caption? }] } |
| `gallery-strip` | Galería filmstrip horizontal — úsalo para mostrar una tira de fotos con caption que se desliza en mobile y se alinea en desktop, distinta del masonry. | { eyebrow, title, images: [{ src, alt, caption? }] } |
| `logo-grid-bordered` | logo-grid-bordered — grid de aliados/clientes en celdas con borde y nombre tipográfico; úsalo para muros de logotipos sin imágenes, variante estática del marquee. | { eyebrow, logos: [{ name }] } |
| `logo-marquee` | logo-marquee — banda de aliados como placas tipográficas (monogramas/nombres cortos, sin imágenes); úsalo para prueba social aspiracional entre hero y contenido. | { eyebrow, logos: [{ name }] } |
| `manifesto-split` | manifesto-split — manifiesto/nosotros editorial a dos columnas (titular-declaración enorme + párrafos y puntos). Úsalo para la sección "quiénes somos" o declaración de propósito, sin imágenes. | { eyebrow, statement, paragraphs: [string], points?: [string] } |
| `metrics-columns` | metrics-columns — cuatro métricas en columnas con reglas verticales (value grande + label + detalle); úsalo para comunicar tracción/resultados con aire editorial, distinto del stat-band compacto y del stat-wall en mosaico. | { eyebrow?, metrics: [{ value, label, detail? }] } |
| `pricing-tiers` | pricing-tiers — planes/paquetes en 2-3 columnas con precio, features (check) y un tier destacado (featured) elevado; úsalo para mostrar precios o paquetes de servicio con un plan recomendado. | { eyebrow, title, cta, tiers: [{ name, price, description, features: [string], featured? }] } |
| `process-horizontal` | process-horizontal — timeline horizontal de pasos numerados con línea conectora; úsalo para explicar un método/proceso de 3-5 fases en una fila (desktop) que se apila en mobile. | { eyebrow, title, steps: [{ title, description }] } |
| `process-vertical` | process-vertical — timeline vertical numerado con línea conectora y punto por paso; úsalo para explicar un proceso/metodología en 3-6 pasos secuenciales cuando quieres una lectura de arriba-abajo con jerarquía editorial (distinto del process-horizontal). | { eyebrow, title, steps: [{ title, description }] } |
| `services-cards-asym` | services-cards-asym — Servicios en tarjetas asimétricas (una destacada grande + chicas con número y flecha). Úsalo para presentar 4-6 servicios cuando quieres jerarquía visual y un servicio principal, distinto del ledger y del zigzag. | { eyebrow, title, services: [{ title, description, featured? }] } |
| `services-ledger` | Ledger de servicios — filas tipográficas grandes numeradas con meta a la derecha; úsalo para tarifarios, líneas de servicio o catálogos de producto donde el nombre manda y no quieres tarjetas. | { eyebrow, title, rows: [{ name, description, meta? }] } |
| `split-cta` | split-cta — CTA de cierre a dos columnas sobre fondo oscuro (titular display gigante + acciones apiladas); úsalo para el llamado a la acción final de una página, cuando quieres un cierre rotundo con dos vías de contacto. | { eyebrow, title, description, primaryCta, secondaryCta } |
| `stat-band` | stat-band — franja horizontal compacta de 3-4 cifras separadas por divisores verticales sobre bg-card; úsalo para prueba social numérica en una sola línea (años, proyectos, clientes) sin el peso vertical del stat-wall. | { eyebrow?, stats: [{ value, label }] } |
| `stat-wall` | muro de cifras enormes (fondo secondary), texto mínimo; credenciales/impacto en números | { eyebrow, title, stats: [{ value, label, detail? }] }
| `steps-cards` | Proceso como tarjetas con icono — úsalo para explicar un método/proceso en pasos (icono + número + título + texto) en una retícula con una tarjeta destacada; alternativa no-timeline a "process". | { eyebrow, title, steps: [{ icon, title, description }] } |
| `team-grid` | team-grid — grid editorial de personas con retrato, nombre y rol; úsalo para presentar al equipo o socios con encuadres sobrios y ritmo desplazado (no un grid plano de tarjetas). | { eyebrow, title, intro?, members: [{ name, role, image, imageAlt }] } |
| `testimonial-grid` | testimonial-grid — mosaico de 2-3 reseñas reales como quote-cards con bordes finos; úsalo para prueba social plural (distinto del pull-quote único) cuando hay varias opiniones verificables. | { eyebrow, title, testimonials: [{ quote, author, role }] } |
| `testimonial-quote` | testimonial-quote — pull-quote protagónica (una cita grande centrada con autor/rol) · úsalo para: destacar UNA reseña real de cliente con máximo peso y aire; nunca para inventar testimonios ni para listas de varias reseñas | { quote, author, role } |

<!-- Al agregar bloques: registry.ts + esta tabla + skill block-catalog del art-director. -->
