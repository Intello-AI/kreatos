"use client"

import { SiteActivity } from "@/features/sites/components/site-activity"
import {
  ActivityPanelAside,
  useActivityPanel,
} from "@/components/activity-panel"

export {
  ActivityPanelProvider as SiteActivityProvider,
  ActivityPanelTrigger as SiteActivityTrigger,
} from "@/components/activity-panel"

/** Monitor de actividad del sitio montado en el panel lateral genérico. */
export function SiteActivityAside({
  runIds,
  siteId,
}: {
  runIds: string[]
  siteId: string
}) {
  const { toggle } = useActivityPanel()
  return (
    <ActivityPanelAside title="Monitor de actividad">
      {/* onClose solo pinta X en mobile (md:hidden dentro de SiteActivity):
          es la única X del sheet — la default está apagada porque chocaba
          con el badge del header. En desktop cierra el trigger de la página. */}
      <SiteActivity runIds={runIds} siteId={siteId} onClose={toggle} />
    </ActivityPanelAside>
  )
}
