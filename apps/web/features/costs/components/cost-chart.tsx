"use client"

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { formatInTimeZone } from "date-fns-tz"
import { es } from "date-fns/locale"

import { USER_TIME_ZONE } from "@/lib/dates"
import { formatUsd } from "@/lib/format"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  cost: {
    label: "Gasto IA",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

function dayLabel(date: string): string {
  return formatInTimeZone(
    new Date(`${date}T12:00:00Z`),
    USER_TIME_ZONE,
    "d MMM",
    { locale: es },
  )
}

/** Gasto de IA (USD) por día, últimos 30 días. Misma factura que ActivityChart. */
export function CostChart({
  data,
}: {
  data: Array<{ date: string; cost: number }>
}) {
  return (
    <ChartContainer config={chartConfig} className="h-56 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 4 }}>
        <defs>
          <linearGradient id="fillCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-cost)" stopOpacity={0.6} />
            <stop offset="95%" stopColor="var(--color-cost)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={dayLabel}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => dayLabel(String(value))}
              formatter={(value) => (
                <span className="tabular-nums">{formatUsd(Number(value))}</span>
              )}
              indicator="line"
            />
          }
        />
        <Area
          dataKey="cost"
          type="monotone"
          fill="url(#fillCost)"
          stroke="var(--color-cost)"
          strokeWidth={1.5}
        />
      </AreaChart>
    </ChartContainer>
  )
}
