import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Réplica exacta de la estructura del dashboard: cero layout shift. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-2 py-4">
            <CardHeader className="px-4">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-1.5 px-4">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3.5 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actividad + pipeline */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="space-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3.5 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-56 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3.5 w-40" />
          </CardHeader>
          <CardContent className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-4 w-6" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Sitios recientes + categorías */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-56" />
          </CardHeader>
          <CardContent className="divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-6" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
