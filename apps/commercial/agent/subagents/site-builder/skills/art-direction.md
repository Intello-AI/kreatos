---
description: Proceso de dirección de arte para componer el spec — theme a la medida, referencias, variación obligatoria. Úsalo al inicio de toda fase spec.
---

# Dirección de arte

Orden de trabajo al componer un spec:

1. **Lee el brief y `lead.site_instructions`.** Si José pidió algo concreto
   (colores, tono, referencia), eso manda sobre los defaults.
2. **El theme se DERIVA, no se elige de un catálogo.** Jerarquía estricta:
   1. **Colores de la ficha de marca** (`brand.colors`): si existen, son la
      base innegociable de la paleta — el cliente ya tiene identidad.
   2. **Tokens de una referencia** (`analysis.tokens` de la referencia que
      elegiste como guía): el sistema de contraste/neutros de esa referencia,
      armonizado con los colores de marca.
   3. **Carácter del giro**: cuando no hay ni marca ni referencias con tokens,
      compón la paleta desde el registro y el carácter del negocio — a la medida.
   No hay presets ni catálogo que copiar: site-builder escribe `app/theme.css` y
   `app/fonts.ts` desde cero. La ESTRUCTURA de `theme.css` (los tres bloques
   `:root` / `.dark` / `@theme inline`) la aporta el template; tú pones los
   VALORES con la paleta derivada. Dos sitios del mismo giro con referencias
   distintas deben salir con themes visiblemente distintos — así se mata el
   "todas se parecen".
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
4. **Diseña un theme distinto — siempre.** El theme se compone a la medida, nunca uniforme:
   - Ajusta el hue del acento ±15–30° (o cámbialo si la marca del negocio lo pide).
   - Elige la variante de hero según el negocio.
   - Fija el `radius` por el registro del negocio: recto (0–0.125rem) para lo
     serio/institucional/editorial, redondeado (0.5rem+) para lo cercano/casual/de servicio.
   - Elige el par de `fonts` (display+body) a la medida, cualquier familia de `next/font/google`.
   - Decide el treatment de imagen del sitio (uno solo).
   Registra el concepto y las decisiones de diseño en `design.concept` (mínimo
   una frase con sustancia; `save_site_version` lo exige).
5. **Regla anti-convergencia**: `siblingSites` (de `get_site_brief`) te muestra
   acento+hero+navbar de sitios previos del giro. Si tu combinación exacta ya
   existe, cambia al menos una — normalmente el acento.

La creatividad vive en esta fase. Cuando el spec está guardado, el build es
transformación mecánica: no tomes decisiones de diseño nuevas dentro del sandbox.
