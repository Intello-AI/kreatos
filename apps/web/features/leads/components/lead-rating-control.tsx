"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { setLeadRating } from "@/features/leads/rating-actions"
import {
  MANUAL_RATINGS,
  MANUAL_RATING_LABELS,
  type ManualRating,
} from "@/features/leads/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/** Clases del segmento activo por calificación (tokens semánticos). */
const ACTIVE_CLASSES: Record<ManualRating, string> = {
  good: "bg-success text-success-foreground hover:bg-success/90",
  regular: "bg-warning text-warning-foreground hover:bg-warning/90",
  bad: "bg-destructive/15 text-destructive hover:bg-destructive/25 dark:bg-destructive/25",
}

/**
 * Control compacto para que José califique un lead a mano (bueno/regular/malo)
 * con una nota opcional. Persiste al instante vía server action.
 */
export function LeadRatingControl({
  leadId,
  rating,
  note,
}: {
  leadId: string
  rating: ManualRating | null
  note: string | null
}) {
  const [current, setCurrent] = useState<ManualRating | null>(rating)
  const [noteText, setNoteText] = useState(note ?? "")
  const [pending, startTransition] = useTransition()

  function persist(next: ManualRating | null, nextNote: string) {
    const previous = current
    setCurrent(next)
    startTransition(async () => {
      const result = await setLeadRating(
        leadId,
        next,
        next === null ? undefined : nextNote
      )
      if (result.formError) {
        setCurrent(previous)
        toast.error(result.formError)
      }
    })
  }

  function onSelect(value: ManualRating) {
    // Volver a tocar la calificación activa la limpia.
    persist(current === value ? null : value, noteText)
  }

  const noteDirty = (note ?? "") !== noteText

  return (
    <div className="space-y-2">
      <div className="inline-flex gap-1" role="group" aria-label="Calificar lead">
        {MANUAL_RATINGS.map((value) => {
          const active = current === value
          return (
            <Button
              key={value}
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              aria-pressed={active}
              onClick={() => onSelect(value)}
              className={cn(active && ACTIVE_CLASSES[value])}
            >
              {MANUAL_RATING_LABELS[value]}
            </Button>
          )
        })}
      </div>

      {current !== null && (
        <div className="space-y-1.5">
          <Textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Nota (opcional): por qué esta calificación…"
            rows={2}
            className="text-sm"
            aria-label="Nota de la calificación"
          />
          {noteDirty && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => persist(current, noteText)}
            >
              Guardar nota
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
