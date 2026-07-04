---
description: Proceso de dirección de arte para componer el spec — preset, referencias, variación obligatoria. Úsalo al inicio de toda fase spec.
---

# Dirección de arte

Orden de trabajo al componer un spec:

1. **Lee el brief y `lead.site_instructions`.** Si José pidió algo concreto
   (colores, tono, referencia), eso manda sobre los defaults.
2. **Elige el preset** por giro y tono usando los metadatos de `design_presets`
   (llegan en `get_site_brief`): obsidiana (despachos), cantera (construcción),
   ruta (logística), bodega (distribución), norte (consultoría/premium o cuando
   ninguno encaja del todo).
3. **Toma 2–3 referencias** de `designReferences`. De cada una extrae 1–3
   **takeaways como decisiones concretas** ("servicios como lista numerada con
   número gigante", "acento solo en CTAs y datos"). Registra los takeaways en
   `design.references` del spec. Prohibido el takeaway "usar el mismo layout";
   las referencias inspiran decisiones, no se copian.
4. **Varía el preset — siempre.** El preset es punto de partida, nunca uniforme:
   - Ajusta el hue del acento ±15–30° (o cámbialo si la marca del negocio lo pide).
   - Elige la variante de hero entre las permitidas por el preset según el negocio.
   - Decide el treatment de imagen del sitio (uno solo).
   Registra qué variaste y por qué en `design.variation_notes` (mínimo una frase
   con sustancia; `save_site_version` la exige).
5. **Regla anti-convergencia**: `siblingSites` (de `get_site_brief`) te muestra
   preset+hero+acento de sitios previos del giro. Si tu combinación exacta ya
   existe, cambia al menos una de las tres — normalmente el acento.

La creatividad vive en esta fase. Cuando el spec está guardado, el build es
transformación mecánica: no tomes decisiones de diseño nuevas dentro del sandbox.
