---
description: Reglas duras contra el diseño genérico/AI-slop. Aplícalas al componer cada spec y verifícalas antes de dar por buena una versión.
---

# Anti-genérico

Un sitio de kreatos debe verse encargado a una agencia, no salido de una plantilla.
Estas reglas son verificables — repásalas contra tu spec una por una.

## Prohibido (si aparece, la versión está mal)

- Gradientes morados/violeta-azul, y cualquier gradiente sobre texto de hero.
- Hero centrado con título + subtítulo + dos botones idénticos (el default de
  toda plantilla). El hero de kreatos es asimétrico o tiene un gesto propio.
- Inter, Roboto o system-ui como tipografía display.
- Emojis en headings, cards, CTAs o cualquier parte del sitio. Iconos 🚀✨💡.
- Lorem ipsum, "placeholder", "TODO", texto de relleno de cualquier tipo.
- Grid de 3 cards idénticas (icono arriba, título, párrafo) para servicios.
- Glassmorphism sin motivo; `shadow-xl` + `rounded-2xl` en todo sobre blanco.
- La misma animación fade-in en cada sección. Una sola coreografía sutil.
- Footer de 4 columnas con enlaces que no llevan a nada.
- Colores literales (`bg-blue-500`, hex en clases) fuera de los tokens del theme.
- Claims vacíos: "empresa líder", "soluciones integrales", "calidad y excelencia".

## Obligatorio (cada sitio los cumple todos)

- **Un gesto memorable** por sitio: tipografía display enorme, numeración gigante
  en servicios, una banda de color, un dato destacado, una textura. Uno — no cinco.
- **Asimetría** en al menos el hero o los servicios.
- **El acento se usa con avaricia**: CTAs y datos clave. Nunca fondos completos
  de secciones enteras.
- **Datos reales arriba**: años operando, rating de Google, número de reseñas —
  están en el lead, úsalos en el trust-bar y en el copy.
- **Jerarquía tipográfica fuerte**: el título del hero domina la pantalla; los
  tamaños saltan con intención (clamp), no en pasos tímidos.
- **Dark mode intencional**: paleta dark diseñada, no la light invertida.

## Anchos RELATIVOS — nunca fijos (regla dura, el gate la valida)

Al escribir secciones `custom`, el layout debe ser RESPONSIVE de origen. El
ancho fijo es pereza y rompe mobile:

- **Ancho**: `w-full`, fracciones de grid (`lg:col-span-7`), `max-w-*` en el
  contenedor, `flex-1`/`basis-0`. NUNCA `w-[420px]` ni `w-52`/`w-64` para
  bloques de layout. `validate-config` rechaza pixel-widths y `w-40+`.
- **Media**: contenedores con `aspect-[4/5]`/`aspect-video` + `w-full`, o
  `min-h-[Nsvh]` para bandas — no `h-[420px] w-[420px]`. `size-*` solo para
  íconos/blobs decorativos cuadrados.
- **Mínimos/máximos sí**: `min-w-0` (imprescindible en items de grid/flex con
  hijo ancho, si no desborda), `max-w-prose`, `min-w-52` responsive están bien.

## Usa los primitivos de shadcn (ya instalados) en vez de reinventar

El template trae `components/ui/`: `button`, `card`, `badge`, `accordion`,
`navigation-menu`, `separator`, `input`, `textarea`. Compón con ellos en las
custom (Card para tarjetas, Accordion para FAQ/desgloses, Badge para etiquetas)
— se ven pulidos, accesibles y consistentes. No reimplementes un acordeón o una
card a mano si shadcn ya la da. (Cero deps nuevas: usa lo instalado.)

## Fondo con imagen — un recurso, úsalo (no todo tipografía plana)

Un sitio 100% texto sobre fondo liso se lee a plantilla. Cada sitio con fotos
debe tener ≥1 momento de imagen protagonista: hero `full-bleed`, un bloque de
fondo con imagen (`banner-image`, `cta-bg-image`, `stat-bg-image`,
`feature-bg-split`, `image-fullbleed-caption`), o una `custom` con `SmartImage`
en `absolute inset-0 -z-10` + overlay de token (`bg-[var(--hero-overlay)]` o
`bg-foreground/55`) y texto en `text-primary-foreground`. El gate lo exige.
