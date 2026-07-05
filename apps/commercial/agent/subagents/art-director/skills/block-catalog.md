---
description: "Catálogo de la BIBLIOTECA DE BLOQUES del motor — secciones curadas y probadas que compones eligiendo (no escribes .tsx). Léela SIEMPRE al armar sections del spec: prefiere bloques sobre secciones de motor genéricas. Cada fila trae el arquetipo y la forma del ns de copy."
---

# Catálogo de bloques (biblioteca del motor)

Bloques curados, probados y de arquetipos DISTINTOS. El agente los COMPONE:
declara \`{ id: "block", block: "<key>", ns: "<namespace>" }\` en site.config.ts y
llena el copy en messages/es.json con la forma \`ns\` indicada. NO se escribe .tsx
(a diferencia de components/custom/). Objetivo: variedad sin esfuerzo → menos
sitios que se ven a plantilla.

**Reglas de composición:** no repitas el mismo bloque más de 2 veces en un sitio;
ALTERNA arquetipos vecinos (una banda densa junto a una aireada, un muro de cifras
junto a una lista editorial, un fondo oscuro junto a uno claro). El RITMO es lo que
hace único a un sitio. Los bloques con imagen leen la ruta del copy (item.image =
"/images/x.webp"). Los que llevan \`data-demo\` son placeholders aspiracionales.

| block (key) | arquetipo · úsalo para | forma del \`ns\` (keys en es.json) |
| --- | --- | --- |
| `about-split-metrics` | about-split-metrics — sobre-nosotros a dos columnas (imagen real izquierda + relato con 2 párrafos y fila de 3 métricas); úsalo para presentar la empresa con prueba cuantitativa sin caer en grid de tarjetas. | { eyebrow, title, body: [string], metrics: [{ value, label }], image, imageAlt } |
| `banner-statement` | Banda-manifiesto full-bleed de color sólido con una sola declaración grande centrada + label chico — úsalo para separar el sitio con una afirmación de marca de alto impacto entre secciones. | { statement, label? } |
| `bento-grid` | bento-grid — mosaico asimétrico (una celda grande 2x2 + celdas 1x1) con bordes finos; úsalo para resumir capacidades/pilares con jerarquía visual en vez de un grid de tarjetas iguales. | { eyebrow, title, cells: [{ title, description, wide? }] } |
| `comparison-table` | comparison-table — tabla comparativa "con nosotros vs sin nosotros" / capacidades; úsalo para contrastar tu propuesta contra la alternativa o listar diferenciadores en filas etiquetadas. | { eyebrow, title, columns: [string], rows: [{ label, values: [string] }] } |
| `faq-editorial` | FAQ editorial (acordeón nativo <details>, encabezado sticky a la izquierda) — úsalo para resolver objeciones frecuentes sin JS, con aire y jerarquía tipográfica fuerte. | { eyebrow, title, items: [{ question, answer }] } |
| `feature-alternating-list` | feature-alternating-list — lista editorial numerada con columna izquierda sticky; úsalo para desglosar capacidades, diferenciadores o pilares de servicio en prosa jerárquica (sin imágenes). | { eyebrow, title, intro?, items: [{ title, text }] } |
| `feature-cards-icon` | feature-cards-icon — grid asimétrico de features con icono lucide, título y texto; úsalo para presentar 3-6 capacidades/servicios con jerarquía y aire, no un grid genérico de tarjetas iguales. | { eyebrow, title, features: [{ icon, title, description }] } |
| `feature-zigzag` | filas alternando imagen izq/der, con aire; para 2-4 servicios/pilares con foto real | { eyebrow, title, intro?, features: [{ title, description, image, imageAlt }] }
| `gallery-masonry` | gallery-masonry — galería masonry (columns CSS, alturas variadas) con caption opcional; úsalo para mostrar obra, portafolio fotográfico o showroom sin caer en un grid uniforme | { eyebrow, title, images: [{ src, alt, caption? }] } |
| `logo-marquee` | logo-marquee — banda de aliados como placas tipográficas (monogramas/nombres cortos, sin imágenes); úsalo para prueba social aspiracional entre hero y contenido. | { eyebrow, logos: [{ name }] } |
| `process-horizontal` | process-horizontal — timeline horizontal de pasos numerados con línea conectora; úsalo para explicar un método/proceso de 3-5 fases en una fila (desktop) que se apila en mobile. | { eyebrow, title, steps: [{ title, description }] } |
| `services-ledger` | Ledger de servicios — filas tipográficas grandes numeradas con meta a la derecha; úsalo para tarifarios, líneas de servicio o catálogos de producto donde el nombre manda y no quieres tarjetas. | { eyebrow, title, rows: [{ name, description, meta? }] } |
| `split-cta` | split-cta — CTA de cierre a dos columnas sobre fondo oscuro (titular display gigante + acciones apiladas); úsalo para el llamado a la acción final de una página, cuando quieres un cierre rotundo con dos vías de contacto. | { eyebrow, title, description, primaryCta, secondaryCta } |
| `stat-band` | stat-band — franja horizontal compacta de 3-4 cifras separadas por divisores verticales sobre bg-card; úsalo para prueba social numérica en una sola línea (años, proyectos, clientes) sin el peso vertical del stat-wall. | { eyebrow?, stats: [{ value, label }] } |
| `stat-wall` | muro de cifras enormes (fondo secondary), texto mínimo; para credenciales/impacto en números | { eyebrow, title, stats: [{ value, label, detail? }] }
| `testimonial-quote` | testimonial-quote — pull-quote protagónica (una cita grande centrada con autor/rol) · úsalo para: destacar UNA reseña real de cliente con máximo peso y aire; nunca para inventar testimonios ni para listas de varias reseñas | { quote, author, role } |

<!-- Al agregar un bloque: registrarlo en registry.ts, agregar su fila aquí, y espejar en el skill block-catalog del art-director. -->
