"use client"

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { formatInTimeZone } from "date-fns-tz"
import { es } from "date-fns/locale"

import { USER_TIME_ZONE } from "@/lib/dates"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  leads: {
    label: "Leads",
    color: "var(--chart-1)",
  },
  sites: {
    label: "Sitios",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

function dayLabel(date: string): string {
  // date llega como yyyy-MM-dd (ya bucketeado en la zona de la operación).
  return formatInTimeZone(new Date(`${date}T12:00:00Z`), USER_TIME_ZONE, "d MMM", {
    locale: es,
  })
}

export function ActivityChart({
  data,
}: {
  data: Array<{ date: string; leads: number; sites: number }>
}) {
  return (
    <ChartContainer config={chartConfig} className="h-56 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 4 }}>
        <defs>
          <linearGradient id="fillLeads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-leads)" stopOpacity={0.6} />
            <stop offset="95%" stopColor="var(--color-leads)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="fillSites" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-sites)" stopOpacity={0.6} />
            <stop offset="95%" stopColor="var(--color-sites)" stopOpacity={0.05} />
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
              indicator="line"
            />
          }
        />
        <Area
          dataKey="sites"
          type="monotone"
          fill="url(#fillSites)"
          stroke="var(--color-sites)"
          strokeWidth={1.5}
        />
        <Area
          dataKey="leads"
          type="monotone"
          fill="url(#fillLeads)"
          stroke="var(--color-leads)"
          strokeWidth={1.5}
        />
      </AreaChart>
    </ChartContainer>
  )
}
