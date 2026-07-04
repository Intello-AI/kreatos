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
  const { toggle, isMobile } = useActivityPanel()
  return (
    <ActivityPanelAside title="Monitor de actividad">
      <SiteActivity
        runIds={runIds}
        siteId={siteId}
        onClose={isMobile ? undefined : toggle}
      />
    </ActivityPanelAside>
  )
}
