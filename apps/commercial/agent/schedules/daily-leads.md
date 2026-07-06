---
cron: "0 14 * * *"
---

<!--
  Corrida diaria del pipeline comercial: leads → propuestas → borradores.
  Vercel evalúa el cron en UTC: 14:00 UTC = 8:00 AM America/Mexico_City (UTC-6).
  Ciudad y categorías son configurables editando la lista de abajo.
  En dev el cron no dispara; probar con:
  POST /eve/v1/dev/schedules/daily-leads
-->

Corrida diaria del pipeline comercial. Tres etapas, en orden, con topes duros
de costo. Es una corrida de background: no produzcas resumen final largo — los
resultados quedan en las tablas.

Cobertura: **todo México**. NO fijes Torreón. Cada corrida elige **2-3 ciudades
de `MX_CITIES`** (la lista de ~40 zonas metro en lead-finder/lib/constants.ts),
**rotando** para no repetir siempre las mismas — p. ej. arranca por una distinta
cada día (CDMX, Guadalajara, Monterrey, Puebla, Tijuana, León, Querétaro… y las
medianas). El objetivo es barrer el país con el tiempo, no clavarse en una zona.

## Etapa 1 — Leads nuevos

Delega al subagente **lead-finder**, **una ciudad + una categoría a la vez**
(Places es city-scoped), recorriendo estas categorías:

1. despachos contables
2. constructoras
3. empresas de logística y transporte
4. distribuidores y mayoristas

Para cada delegación pásale la categoría y la ciudad elegida. lead-finder evalúa
la CALIDAD del sitio de cada negocio y guarda los calificados con su
`websiteQuality` (tope global de 20 leads guardados por corrida: si sus
respuestas indican que ya se alcanzó, pasa a la etapa 2 sin delegar más).

## Etapa 2 — Propuestas para los mejores

Delega al subagente **proposal**: que genere propuestas para los leads más
recientes en status `new` que aún no tienen propuesta, **priorizando los más
vendibles**: primero `websiteQuality` none/broken/outdated/weak (sin web o web
fea = venta clara), luego datos completos (teléfono, rating). Los `decent` van
al final o se saltan. **Máximo 5 propuestas por corrida** — pásale ese tope
explícito en el mensaje.

## Etapa 3 — Borradores de contacto

Delega al subagente **outreach**: que redacte borradores de primer contacto
para los leads en `proposal_ready` que aún no tienen borrador. **Máximo 5 por
corrida.** outreach NUNCA envía nada: solo deja borradores en lead_activity
para revisión humana.

Si una etapa falla, continúa con la siguiente y anótalo en una línea. El
resultado de la corrida: leads nuevos en `leads`, propuestas en
`proposal_ready`, borradores en `lead_activity` — todo listo para revisión
humana en el dashboard por la mañana. Los sitios web NO se generan aquí:
esa decisión es del humano, lead por lead.
