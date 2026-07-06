---
description: Recetario de secciones por giro — cuáles usar, en qué orden, con qué variante, y cuáles omitir. Úsalo al definir sections en el spec.
---

# Patrones de secciones por giro

El orden en `spec.sections` es el orden de render. Menos secciones bien resueltas
ganan a muchas a medias.

## Recetas base

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
