"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MagicWandIcon, PaperPlaneRightIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import {
  addReferences,
  analyzeReferences,
} from "@/features/references/actions"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

/**
 * Composer estilo chat: pegas URLs (una por línea) y las mandas con Enter;
 * el botón de varita lanza el análisis de las pendientes con design-scout.
 */
export function ReferencesComposer({ pendingCount }: { pendingCount: number }) {
  const router = useRouter()
  const [urls, setUrls] = useState("")
  const [adding, startAdding] = useTransition()
  const [analyzing, startAnalyzing] = useTransition()

  const onAdd = () => {
    if (!urls.trim()) return
    startAdding(async () => {
      const result = await addReferences(urls)
      if (result.formError) {
        toast.error(result.formError)
        return
      }
      setUrls("")
      toast.success(
        `${result.added} referencia(s) agregada(s)` +
          (result.skipped ? `, ${result.skipped} ya existía(n)` : "") +
          (result.analysisStarted
            ? " — design-scout ya las está analizando"
            : "")
      )
      if (result.added && !result.analysisStarted) {
        toast.warning(
          "No se pudo arrancar el análisis automático; usa el botón Analizar."
        )
      }
      router.refresh()
    })
  }

  const onAnalyze = () => {
    startAnalyzing(async () => {
      const result = await analyzeReferences()
      if (result.formError) {
        toast.error(result.formError)
        return
      }
      toast.success(
        "design-scout está analizando; los resultados aparecen aquí al terminar."
      )
      router.refresh()
    })
  }

  return (
    <InputGroup>
      <InputGroupTextarea
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder="Pega URLs de sitios que te gustan, una por línea…"
        rows={2}
        className="text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            if (!adding) onAdd()
          }
        }}
      />
      <InputGroupAddon align="block-end">
        <InputGroupButton
          size="sm"
          variant="outline"
          onClick={onAnalyze}
          disabled={analyzing || pendingCount === 0}
        >
          {analyzing ? <Spinner /> : <MagicWandIcon />}
          Analizar{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </InputGroupButton>
        <InputGroupButton
          size="icon-sm"
          variant="default"
          className="ml-auto"
          onClick={onAdd}
          disabled={adding || !urls.trim()}
          aria-label="Agregar referencias"
        >
          {adding ? <Spinner /> : <PaperPlaneRightIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
