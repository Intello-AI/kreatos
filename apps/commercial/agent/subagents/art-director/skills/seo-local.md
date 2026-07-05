---
description: Checklist SEO local para negocios mexicanos — JSON-LD por giro, NAP consistente, keywords servicio+ciudad. Aplícalo al llenar seo y business en el spec.
---

# SEO local

El template trae el plumbing (Metadata API, sitemap, robots, OG generado,
JSON-LD desde config). Tu trabajo es llenarlo bien.

## JSON-LD: subtipo correcto por giro

| Giro | `seo.jsonLdType` |
|---|---|
| Despacho contable | `AccountingService` |
| Despacho legal | `Attorney` o `LegalService` |
| Constructora | `GeneralContractor` |
| Logística/fletes/mudanzas | `MovingCompany` o `LocalBusiness` |
| Distribuidor/mayorista | `WholesaleStore` |
| Seguros | `InsuranceAgency` |
| Otro | `ProfessionalService` o `LocalBusiness` |

## NAP consistente (crítico para Google)

`business.name`, `business.address` y `business.phone` **idénticos** a los datos
de Google Maps del lead — mismo formato, sin abreviar distinto. El JSON-LD, el
footer y la sección contact salen todos del mismo `config.business`.

## Reglas

- `seo.title`: `<Servicio principal> en <Ciudad> | <Nombre del negocio>` — ≤ 60
  caracteres.
- `seo.description`: 140–155 caracteres, incluye servicio, ciudad y un dato
  diferenciador (años o rating).
- Keywords: combinaciones "servicio + ciudad" reales ("despacho contable
  torreón"), 4–6, sin stuffing.
- H1 único (el hero title) con servicio y ciudad de forma natural.
- `geo` (lat/lng del lead) y `hours` siempre presentes en el JSON-LD.
- Si es rediseño con dominio existente: conserva title/description que ya
  rankean cuando sean decentes y anota redirects en el spec (skill redesign).
