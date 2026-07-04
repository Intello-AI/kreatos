---
description: Recetario de secciones por giro — cuáles usar, en qué orden, con qué variante, y cuáles omitir. Úsalo al definir sections en el spec.
---

# Patrones de secciones por giro

El orden en `spec.sections` es el orden de render. Menos secciones bien resueltas
ganan a muchas a medias.

## Recetas base

- **Despacho contable/legal** (obsidiana): hero `editorial` → trust-bar →
  services `numbered-list` (5–6) → about `plain` → testimonials → faq (5, fiscal/
  legal real) → cta-band → contact.
- **Constructora** (cantera): hero `full-bleed` (foto de obra + duotone) →
  trust-bar (m², años, proyectos) → services `asym-grid` → portfolio `rows` →
  process (4–5 pasos) → testimonials → cta-band → contact.
- **Logística/transporte** (ruta): hero `split-image` o `stat-led` → trust-bar →
  services → coverage (zonas/rutas — obligatoria en este giro) → process →
  testimonials → faq → contact.
- **Distribuidor/mayorista** (bodega): hero `split-image` → trust-bar →
  services `bordered-table` (líneas de producto tipo catálogo) → about →
  coverage (zonas de reparto) → faq → cta-band → contact.
- **Consultoría/premium** (norte): hero `stat-led` asimétrico → services
  `numbered-list` → about `portrait` o `timeline` → testimonials → cta-band →
  contact. Pocas secciones, mucho aire.

## Reglas de omisión

- **Sin portfolio** si no hay fotos reales de proyectos (nunca portfolio de stock).
- **Sin testimonials** si `reviews_count < 5` o las reseñas no dan citas usables.
- **Sin process** en despachos salvo que el brief lo pida.
- Solo reseñas de Google **reales** en testimonials (texto del lead o sus
  reseñas); si no hay texto de reseñas disponible, usa el rating agregado en el
  trust-bar y omite la sección.
- contact siempre al final, con mapa si la ubicación importa para el negocio
  (`showMap: false` para negocios que trabajan a domicilio).
