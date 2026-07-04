"use client"

import { useState } from "react"
import { ChatCircleDotsIcon, SidebarSimpleIcon } from "@phosphor-icons/react"

import { SiteActivity } from "@/features/sites/components/site-activity"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

/**
 * Contenedor del monitor de actividad:
 * - Desktop: aside sticky colapsable (rail con botón cuando está cerrado).
 * - Mobile: botón flotante que abre un Sheet inferior.
 */
export function SiteActivityPanel({
  runIds,
  siteId,
}: {
  runIds: string[]
  siteId: string
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(true)

  if (runIds.length === 0) return null

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button
            size="icon-lg"
            className="fixed right-4 bottom-4 z-40 shadow-lg"
            aria-label="Abrir monitor de actividad"
          >
            <ChatCircleDotsIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85dvh] gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Monitor de actividad</SheetTitle>
          </SheetHeader>
          <SiteActivity runIds={runIds} siteId={siteId} />
        </SheetContent>
      </Sheet>
    )
  }

  if (!open) {
    return (
      <aside className="sticky top-12 flex h-[calc(100vh-48px)] w-12 shrink-0 items-start justify-center border-l p-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          aria-label="Abrir monitor de actividad"
        >
          <SidebarSimpleIcon />
        </Button>
      </aside>
    )
  }

  return (
    <aside className="sticky top-12 h-[calc(100vh-48px)] w-[380px] shrink-0 overflow-hidden border-l lg:w-[440px] xl:w-[480px]">
      <SiteActivity
        runIds={runIds}
        siteId={siteId}
        onClose={() => setOpen(false)}
      />
    </aside>
  )
}
