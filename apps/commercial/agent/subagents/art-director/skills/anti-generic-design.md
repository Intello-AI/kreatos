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
