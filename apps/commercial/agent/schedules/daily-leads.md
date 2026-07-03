---
cron: "0 14 * * *"
---

<!--
  Corrida diaria de generación de leads.
  Vercel evalúa el cron en UTC: 14:00 UTC = 8:00 AM America/Mexico_City (UTC-6).
  Ciudad y categorías son configurables editando la lista de abajo.
  En dev el cron no dispara; probar con:
  POST /eve/v1/dev/schedules/daily-leads
-->

Corrida diaria de búsqueda de leads.

Ciudad objetivo: **Torreón, Coahuila**.

Delega al subagente **lead-finder**, una categoría a la vez y en este orden:

1. despachos contables
2. constructoras
3. empresas de logística y transporte
4. distribuidores y mayoristas

Para cada categoría pásale en el mensaje la categoría y la ciudad. lead-finder aplica sus
criterios de calidad y guarda los calificados (tope global de 20 leads guardados por
corrida: si sus respuestas indican que ya se alcanzó, detente y no delegues más categorías).

No generes propuestas ni borradores de contacto en esta corrida; solo búsqueda. Esta
corrida es de background: no produzcas resumen final, los resultados quedan en la tabla
`leads`.
