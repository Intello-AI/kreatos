# Criterio de demo (el preview VENDE)

El preview no es el sitio final: es la MAQUETA que cierra la venta. El
cliente lo abre y decide si paga. Tu criterio en cada sección es UNO:
**¿esto le muestra algo que va a QUERER tener?** Si sí, la sección existe —
aunque hoy falte el material — con un placeholder DISEÑADO. Si no vende,
se recorta.

## Placeholders aspiracionales (permitidos y deseables)

La diferencia entre un placeholder que vende y uno que avergüenza es el
DISEÑO, no el dato:

- **Logos de clientes**: sí a la banda de logos aunque no haya logos.
  Rectángulos tipográficos elegantes (monograma o nombre corto en la
  display del sitio, tono muted, mismo tamaño), 5-6, con un eyebrow tipo
  "Empresas que confían" — se lee como maqueta profesional, no como hueco.
  PROHIBIDO: cajas punteadas con la palabra "LOGO" adentro.
- **Portafolio/proyectos sin fotos del cliente**: stock del giro con el
  treatment del sitio (duotone/bw) + títulos de proyecto plausibles del
  GIRO ("Nave industrial 2,400 m²", "Remodelación corporativa") marcados
  en el changelog como ilustrativos. El cliente ve cómo se VERÍA su obra.
- **Fotos de equipo/instalaciones**: stock con treatment, encuadres de
  detalle (manos, herramienta, espacio), nunca caras stock sonrientes.
- **Métricas de sección custom**: estimaciones conservadoras del giro
  marcadas en changelog — nunca cifras espectaculares inventadas.

## Línea dura (esto NO se placeholder-ea jamás)

Lo que puede confundirse con un HECHO del negocio real:

- Ratings y número de reseñas fantasma (el cliente sabe cuántas tiene).
- Testimonials con citas inventadas y nombres de personas — jamás. Si no
  hay reseñas usables, la sección de testimonios no existe.
- Años de experiencia, premios, certificaciones sin fuente.
- Nombres de clientes REALES que no lo son (los rectángulos tipográficos
  usan monogramas/genéricos, no "CEMEX" si CEMEX no es cliente).

## Convención de marcado (para que site-manager encuentre TODO rápido)

Tres marcadores, uno por superficie — el que completa el sitio no debe
cazar placeholders a ojo:

1. **`DEMO.md` en la raíz del repo** (manifiesto canónico): checklist de
   TODO material pendiente, escrito al terminar el build. Formato:

   ```markdown
   # Pendientes del demo — <negocio>

   - [ ] Logos de clientes (3-6) → components/custom/clients-strip.tsx + ns "clients-strip" en es.json
   - [ ] Fotos de proyectos (4+) → public/images/proyecto-*.webp (hoy stock ilustrativo)
   - [ ] Teléfono real → site.config.ts business.phone (// MOCK)
   ```

   Cada línea: qué material se necesita → dónde vive exactamente. Al
   completar un ítem se marca `- [x]` y se reemplaza el material.
2. **`data-demo="<qué>"`** en el contenedor JSX de toda custom section con
   material placeholder (`<section data-demo="logos-clientes">`) —
   greppeable en código y localizable inspeccionando el DOM.
3. **`// MOCK`** en cada línea de site.config.ts con dato de contacto
   provisional (ya obligatorio; publish_site los bloquea).

## Reglas

- Todo placeholder aspiracional queda LISTADO en el changelog bajo
  "Material a reemplazar con el cliente" — es la lista de tareas del
  onboarding cuando compre.
- El placeholder hereda el sistema del sitio (tokens, tipografía,
  treatment): si se ve pegado, es un major en la review visual.
- Publicar a producción con placeholders aspiracionales requiere decisión
  del humano; los mocks de contacto (// MOCK) se bloquean solos.
