"use client"

import { useState, useTransition } from "react"
import { TranslateIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { updateLeadLanguage } from "@/features/leads/actions"
import {
  LANGUAGE_LABELS,
  LANGUAGES,
  type Language,
} from "@/features/leads/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

/**
 * Idioma primario del cliente, editable en el detalle del lead. Define el
 * locale DEFAULT del sitio que se genere (el dialog "Generar sitio" lo
 * preselecciona): "es" para MX, "en" para clientes de US.
 */
export function LeadLanguageSelect({
  leadId,
  language,
}: {
  leadId: string
  language: Language
}) {
  const [current, setCurrent] = useState<Language>(language)
  const [pending, startTransition] = useTransition()

  const onChange = (next: string) => {
    const nextLang = next as Language
    const previous = current
    setCurrent(nextLang)
    startTransition(async () => {
      const result = await updateLeadLanguage(leadId, nextLang)
      if (result.formError) {
        setCurrent(previous)
        toast.error(result.formError)
      }
    })
  }

  return (
    <Select value={current} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        className="h-auto gap-1.5 border-none bg-transparent p-0 text-xs text-muted-foreground shadow-none dark:bg-transparent"
        aria-label="Cambiar idioma del cliente"
      >
        <TranslateIcon className="size-3.5 shrink-0" />
        {LANGUAGE_LABELS[current]}
      </SelectTrigger>
      <SelectContent align="start">
        {LANGUAGES.map((option) => (
          <SelectItem key={option} value={option}>
            {LANGUAGE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
