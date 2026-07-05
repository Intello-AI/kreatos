import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const COLUMNS = [
  "Nombre",
  "Categoría",
  "Ciudad",
  "Teléfono",
  "Rating",
  "Estado",
  "Costo IA",
  "Creado",
]

export function LeadsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }, (_, row) => (
          <TableRow key={row}>
            {COLUMNS.map((column) => (
              <TableCell key={column}>
                <Skeleton className="h-4 w-full max-w-32" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
