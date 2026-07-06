---
description: Cómo elegir el par tipográfico a la medida y reglas de uso. Consúltalo al elegir fonts en el spec.
---

# Tipografía

Máximo **2 familias** por sitio: una display con carácter + una sans de trabajo.
El par se elige **a la medida** del negocio y va en el spec como
`design.fonts: { display, body }` — CUALQUIER familia de `next/font/google`,
no una lista cerrada. site-builder reescribe `app/fonts.ts` con esas dos.

## Pares sugeridos (punto de partida, no catálogo cerrado)

Buenas combinaciones por carácter — arráncate de una y ajústala, o compón la
tuya; lo importante es que encaje con el registro del negocio, no repetir el
mismo par entre sitios del giro.

| id | Display | Body | Cuándo |
|---|---|---|---|
| `fraunces-albert` | Fraunces (serif alto contraste) | Albert Sans | Despachos, autoridad editorial |
| `libre-caslon-albert` | Libre Caslon | Albert Sans | Legal clásico, más formal |
| `archivo-inter` | Archivo (grotesca expandida) | Inter | Construcción, industrial |
| `barlow-condensed-inter` | Barlow Condensed | Inter | Obra pesada, señalética |
| `sora-mono` | Sora | + JetBrains Mono para datos | Logística: rutas, tiempos, unidades en mono |
| `manrope-mono` | Manrope | + mono para datos | Logística/tech, más suave |
| `bricolage-instrument` | Bricolage Grotesque | Instrument Sans | Distribución, catálogo con carácter |
| `newsreader-sans` | Newsreader (serif grande) | sans discreta | Consultoría premium, minimal |
| `source-serif-sans` | Source Serif 4 | sans discreta | Alternativa premium sobria |

## Reglas

- La display se usa en headings y en el gesto (número gigante, stat). Nunca Inter
  ni system-ui como display.
- Escala con `clamp()`: el hero domina en desktop sin romper en móvil.
- Jerarquía por **tamaño y peso**, no por color.
- Números tabulares (`tabular-nums`) en stats, precios y datos.
- Condensadas (Barlow): tracking normal-amplio en tamaños chicos; nunca
  condensada + tracking apretado en texto corrido.
- Body: 16–18px, line-height 1.6–1.75, medida de ~65–75 caracteres.
