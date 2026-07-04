"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  answerBrandInput,
  getLeadBrand,
  sendBrandMessage,
} from "@/features/leads/brand-actions"
import { createClient } from "@/lib/supabase/client"
import {
  SiteActivity,
  type ActivityHandlers,
} from "@/features/sites/components/site-activity"
import {
  ActivityPanelAside,
  useActivityPanel,
} from "@/components/activity-panel"

export {
  ActivityPanelProvider as LeadBrandProvider,
  ActivityPanelTrigger as LeadBrandTrigger,
} from "@/components/activity-panel"

/**
 * Chat de marca con brand-curator montado en el panel lateral genérico
 * (detalle del lead): súbele fotos/logos con el clip o arrastrándolas,
 * pásale la página web del negocio, dictale datos — él decide, extrae
 * paleta/voz y guarda la ficha que site-builder consume.
 */
export function LeadBrandAside({
  leadId,
  initialRunIds,
}: {
  leadId: string
  initialRunIds: string[]
}) {
  const { toggle, isMobile } = useActivityPanel()
  const router = useRouter()
  const [runIds, setRunIds] = useState(initialRunIds)

  const handlers = useMemo<ActivityHandlers>(
    () => ({
      // Tras cada envío se refetchea la ficha: el run nuevo entra a
      // eve_run_ids (el chat se conecta a su stream) y la página server
      // se refresca para reflejar lo que el curador haya guardado.
      send: async (text) => {
        const result = await sendBrandMessage(leadId, text)
        if (!result.formError) {
          const brand = await getLeadBrand(leadId)
          setRunIds(brand?.eve_run_ids ?? [])
          router.refresh()
        }
        return result
      },
      answer: async (requestId, text, prompt) => {
        const result = await answerBrandInput(leadId, requestId, text, prompt)
        if (!result.formError) {
          const brand = await getLeadBrand(leadId)
          setRunIds(brand?.eve_run_ids ?? [])
          router.refresh()
        }
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
    [leadId, router]
  )

  return (
    <ActivityPanelAside title="Marca del lead">
      <SiteActivity
        key={leadId}
        siteId={leadId}
        runIds={runIds}
        handlers={handlers}
        onClose={isMobile ? undefined : toggle}
        title="Marca"
        description="Chatea con el curador: súbele logo, fotos o la página web del negocio."
      />
    </ActivityPanelAside>
  )
}
