"use client"

import { useTransition } from "react"
import { ArrowsClockwiseIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

import { reanalyzeReference } from "../actions"

/** Regresa la referencia a pending y manda a design-scout a re-analizarla. */
export function ReanalyzeButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Reanalizar referencia"
      className="ml-auto shrink-0 text-muted-foreground"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reanalyzeReference(id)
          if (result.formError) {
            toast.error(result.formError)
          } else {
            toast.success("design-scout está re-analizando la referencia.")
          }
        })
      }
    >
      <ArrowsClockwiseIcon className={pending ? "animate-spin" : undefined} />
    </Button>
  )
}
