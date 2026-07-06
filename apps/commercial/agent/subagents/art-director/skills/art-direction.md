---
description: Proceso de dirección de arte para componer el spec — theme a la medida (paleta/radius/fuentes), referencias, anti-convergencia. Úsalo al inicio de toda fase spec.
---

# Dirección de arte

Orden de trabajo al componer un spec:

1. **Lee el brief y `lead.site_instructions`.** Si José pidió algo concreto
   (colores, tono, referencia), eso manda sobre los defaults.
2. **El theme se DISEÑA a la medida — no hay catálogo ni temas prefabricados.** Jerarquía
   estricta para la paleta:
   1. **Colores de la ficha de marca** (`brand.colors`): si existen, son la
      base innegociable — el cliente ya tiene identidad.
   2. **Tokens de una referencia** (`analysis.tokens` de la referencia que
      elegiste como guía): el sistema de contraste/neutros de esa referencia,
      armonizado con los colores de marca.
   3. Sin marca ni referencias con tokens: **componla desde el carácter del
      giro** (no de una lista prefabricada). Escribe la paleta completa
      (light+dark, cada token) tú.
   No hay ningún tema prefabricado que copiar: la
   estructura del `app/theme.css` (los tres bloques) es fija y la aporta el
   template; los VALORES los pones tú. Dos sitios del mismo giro deben salir
   con themes visiblemente distintos — así se mata el "todas se parecen".
3. **Las referencias son tu fuente PRIMARIA de inspiración** — José las curó
   a mano; ignorarlas es diseñar de memoria. Toma 2–3 de `designReferences`
   y explota su `analysis` completo: `layout.composition` y `spacing` para
   la retícula y el ritmo, `color.contrast` para la estrategia de contraste,
   `typography.hierarchy` para la jerarquía, `components` como catálogo para
   secciones custom, `tokens` como punto de partida del theme. Muchas serán
   de OTRO giro (SaaS, fintech): eso no importa — composición, espaciado y
   disciplina de acento son transversales; lo que es por giro es el
   contenido, no el criterio. De cada una registra 1–3 **takeaways como
   decisiones concretas** ("servicios como lista numerada con número
   gigante", "jerarquía por opacidad de texto") en `design.references` del
   spec. Prohibido el takeaway "usar el mismo layout"; las referencias
   inspiran decisiones, no se copian.
4. **Compón el theme completo — cada sitio único:**
   - **Paleta**: light+dark, todos los tokens, anclada a la marca (arriba).
   - **`radius`**: lo decide el REGISTRO del negocio — serio/institucional/
     editorial → recto (`0`–`0.125rem`); cercano/casual/de servicio →
     redondeado (`0.5rem`+). Un solo radius gobierna todo el sitio.
   - **`fonts`** (`display` + `body`): el par tipográfico a la medida del
     carácter — cualquier familia de `next/font/google`, sin repetir el de
     sitios previos del giro si puedes evitarlo.
   - **Hero** e **imageTreatment** (uno solo) según el negocio.
   Todo entra al spec; site-builder lo materializa. No partes de ningún
   tema base: diseñas el theme de cero.
5. **Regla anti-convergencia**: `siblingSites` (de `get_site_brief`) te muestra
   acento+hero+navbar de sitios previos del giro. Si tu acento+hero ya existe,
   cambia al menos uno — normalmente el acento (varía el hue ±15–30°).

La creatividad vive en esta fase. Cuando el spec está guardado, el build es
transformación mecánica: no tomes decisiones de diseño nuevas dentro del sandbox.
