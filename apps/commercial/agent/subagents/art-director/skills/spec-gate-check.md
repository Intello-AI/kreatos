---
description: Pre-flight del spec ANTES de save_site_version. Espeja las condiciones EXACTAS por las que el gate rechaza, para pasar a la primera en vez de hacer ping-pong. Córrelo sobre tu spec ya compuesto.
---

# Pre-flight del spec (pasa el gate a la primera)

`save_site_version` rechaza devolviendo la lista COMPLETA de problemas; cada
rechazo es un turno perdido. Verifica esto ANTES de llamarlo. Un rechazo NO es un
error a reportar al humano: es formato tuyo, corriges y reintentas.

## Marca (si la ficha existe)

- [ ] `business.shortName` = `short_name` de la ficha (compose_spec lo trae).
- [ ] `business.logo` e `business.icon` declarados si la ficha tiene logo/isotipo.
- [ ] La paleta USA al menos un color de la ficha (armonizado, no ignorado).
- [ ] Ficha con 3+ servicios reales → hay `pages` con al menos `/servicios` (o
  justificas "one-pager" con la razón EN el changelog).

## Pensamiento de diseño

- [ ] `design.concept` ≥ 60 caracteres: idea rectora real (qué siente/hace el
  visitante + qué gesto de diseño lo logra), no relleno.
- [ ] CADA sección de contenido (no header/footer) tiene `why` ≥ 20 caracteres:
  qué pregunta del visitante responde y por qué ESE layout la responde mejor.
- [ ] Con biblioteca de referencias disponible: `design.references = [{slug,
  takeaways}]` con takeaways reales (qué robas de cada una y qué no).

## Anti-clon y anti-convergencia (dentro del giro)

- [ ] La home NO comparte ≥75% del esqueleto (orden + variants) con un sitio
  reciente del giro. Si se parece, cambia el ORDEN o sustituye secciones.
- [ ] `primary` y `accent` de la paleta: su HUE en OKLCH está ≥15° del de otro
  sitio del MISMO giro — SALVO que el token sea un color de la ficha de marca
  (exención brand-anchored). Si un token ES el color de la marca, déjalo y mueve
  el OTRO token de firma.
- [ ] Páginas interiores no son TODAS la plantilla `page-header + 1 sección +
  cta-band`: al menos una con estructura propia (4+ secciones o una custom).

## Ritmo (si usas bloques de biblioteca, `id:"block"`)

- [ ] No 3 bloques seguidos de la misma familia de arquetipo.
- [ ] ≥ 50% de familias distintas entre los bloques.

Si algo no lo cumples, ARRÉGLALO antes de llamar `save_site_version`.
