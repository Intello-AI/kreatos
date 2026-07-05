/**
 * Formateo de números para el dashboard. USD porque los precios de los modelos
 * (model_pricing) están en dólares por 1M de tokens.
 */

/** Monto en USD. Montos chicos (< $1) llevan más decimales para no colapsar a $0.00. */
export function formatUsd(value: number | null | undefined): string {
  const n = value ?? 0
  const digits = n > 0 && n < 1 ? (n < 0.01 ? 4 : 3) : 2
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
}

/** Tokens en forma compacta: 850, 12k, 3.4M. */
export function formatTokens(value: number | null | undefined): string {
  const n = value ?? 0
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}
