"use client"

import { useMemo, useState, useTransition } from "react"
import { PaletteIcon } from "@phosphor-icons/react"

import {
  answerBrandInput,
  getLeadBrand,
  sendBrandMessage,
  type LeadBrandData,
} from "@/features/leads/brand-actions"
import { createClient } from "@/lib/supabase/client"
import {
  SiteActivity,
  type ActivityHandlers,
} from "@/features/sites/components/site-activity"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

/**
 * Marca del lead como CHAT con brand-curator: le subes fotos/logos con el
 * clip, le dictas datos, y él decide qué usar, extrae paletas (visión) y
 * guarda la ficha que site-builder consume.
 */
export function LeadBrandSheet({
  leadId,
  leadName,
}: {
  leadId: string
  leadName: string | null
}) {
  const [open, setOpen] = useState(false)
  const [brand, setBrand] = useState<LeadBrandData | null | undefined>(
    undefined
  )
  const [loading, startLoading] = useTransition()

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      startLoading(async () => {
        setBrand(await getLeadBrand(leadId))
      })
    }
  }

  const handlers = useMemo<ActivityHandlers>(
    () => ({
      // Tras cada envío se refetchea la ficha: el run nuevo entra a
      // eve_run_ids y el chat se conecta a su stream en vivo.
      send: async (text) => {
        const result = await sendBrandMessage(leadId, text)
        if (!result.formError) setBrand(await getLeadBrand(leadId))
        return result
      },
      answer: async (requestId, text, prompt) => {
        const result = await answerBrandInput(leadId, requestId, text, prompt)
        if (!result.formError) setBrand(await getLeadBrand(leadId))
        return result
      },
      // Upload directo browser → Storage (policy de authenticated): los
      // bytes no pasan por server actions ni por su límite de body.
      upload: async (files) => {
        const supabase = createClient()
        const urls: string[] = []
        for (const file of files) {
          if (file.size > 8 * 1024 * 1024) {
            return { formError: `${file.name} pesa más de 8 MB.`, urls }
          }
          const safeName = file.name
            .toLowerCase()
            .replace(/[^a-z0-9.-]+/g, "-")
          const path = `${leadId}/inbox/${Date.now()}-${safeName}`
          const { error } = await supabase.storage
            .from("brand-assets")
            .upload(path, file, { contentType: file.type || undefined })
          if (error) {
            return {
              formError: `No se pudo subir ${file.name}: ${error.message}`,
              urls,
            }
          }
          const { data } = supabase.storage
            .from("brand-assets")
            .getPublicUrl(path)
          urls.push(data.publicUrl)
        }
        return { ok: true, urls }
      },
    }),
    [leadId]
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Marca del lead">
          <PaletteIcon />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Marca — {leadName ?? "Lead"}</SheetTitle>
          <SheetDescription>
            Chatea con el curador: súbele el logo y fotos con el clip, dictale
            colores, nombre corto o servicios — él decide, extrae la paleta y
            guarda la ficha.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          {loading || brand === undefined ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <SiteActivity
              key={leadId}
              siteId={leadId}
              runIds={brand?.eve_run_ids ?? []}
              handlers={handlers}
              hideHeader
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
