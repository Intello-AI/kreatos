"use client"

import { createContext, useContext, useState } from "react"
import { SidebarSimpleIcon } from "@phosphor-icons/react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

/**
 * Panel lateral con comportamiento de sidebar (como el de la app), genérico
 * para cualquier página de detalle:
 * - `ActivityPanelProvider` envuelve la página (estado abrir/cerrar).
 * - `ActivityPanelTrigger` vive en el header de la página, junto a las
 *   acciones — mismo gesto que el trigger del sidebar principal.
 * - `ActivityPanelAside`: en desktop es un aside sticky cuyo ANCHO se anima
 *   (transition-[width], ease-linear — idéntico al sidebar de shadcn), así
 *   que empuja/libera el contenido en vez de taparlo. En mobile es un Sheet
 *   inferior controlado por el mismo trigger.
 */

const PanelContext = createContext<{
  open: boolean
  toggle: () => void
  isMobile: boolean
} | null>(null)

export function useActivityPanel() {
  const ctx = useContext(PanelContext)
  if (!ctx) {
    throw new Error(
      "ActivityPanel* debe usarse dentro de ActivityPanelProvider"
    )
  }
  return ctx
}

export function ActivityPanelProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  // Desktop nace abierto (el panel es parte del detalle); mobile cerrado.
  const [open, setOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const value = isMobile
    ? { open: mobileOpen, toggle: () => setMobileOpen((v) => !v), isMobile }
    : { open, toggle: () => setOpen((v) => !v), isMobile }

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export function ActivityPanelTrigger({ label }: { label?: string }) {
  const { toggle } = useActivityPanel()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={label ?? "Abrir o cerrar el panel lateral"}
    >
      {/* Espejado: el panel vive a la derecha */}
      <SidebarSimpleIcon className="-scale-x-100" />
    </Button>
  )
}

/** Ancho por breakpoint — el contenedor interno lo fija para que el contenido
 *  no se re-fluya mientras el ancho del aside anima (patrón sidebar). */
const PANEL_WIDTH = "w-[380px] lg:w-[440px] xl:w-[480px]"

export function ActivityPanelAside({
  title,
  children,
}: {
  /** Título accesible del Sheet en mobile. */
  title: string
  children: React.ReactNode
}) {
  const { open, toggle, isMobile } = useActivityPanel()

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(v) => v !== open && toggle()}>
        {/* Pantalla completa en mobile: el chat necesita todo el alto. La
            variante data-[side=bottom] pisa un h-dvh plano — se override con
            la misma variante. La X default choca con el header del chat
            (que ya trae su botón de cierre): se apaga. */}
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="gap-0 rounded-none border-0 p-0 data-[side=bottom]:h-dvh"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      className={cn(
        "sticky top-12 h-[calc(100vh-48px)] shrink-0 overflow-hidden border-l transition-[width] duration-200 ease-linear",
        open ? PANEL_WIDTH : "w-0 border-l-transparent"
      )}
    >
      <div className={cn("h-full", PANEL_WIDTH)}>{children}</div>
    </aside>
  )
}
