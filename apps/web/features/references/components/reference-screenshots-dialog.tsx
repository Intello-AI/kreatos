"use client"

import { ArrowsOutIcon } from "@phosphor-icons/react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Visor de las capturas full-page que design-scout extrajo de la referencia
 * (desktop 1440px + mobile 390px, en Storage). La card solo muestra card.png
 * (viewport); este dialog abre las full-page reales, scrolleables.
 */
export function ReferenceScreenshotsDialog({
  desktopUrl,
  mobileUrl,
  title,
}: {
  desktopUrl: string | null
  mobileUrl: string | null
  title: string
}) {
  // Sin ninguna captura propia no hay nada que abrir (referencias viejas /
  // aún analizándose): no se pinta el botón.
  if (!desktopUrl && !mobileUrl) return null

  return (
    <Dialog>
      <DialogTrigger
        aria-label={`Ver capturas de ${title}`}
        className="absolute top-2 left-2 z-10 flex size-7 items-center justify-center border border-border bg-background/90 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
      >
        <ArrowsOutIcon className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate">{title}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={desktopUrl ? "desktop" : "mobile"}>
          <TabsList>
            {desktopUrl && <TabsTrigger value="desktop">Desktop</TabsTrigger>}
            {mobileUrl && <TabsTrigger value="mobile">Mobile</TabsTrigger>}
          </TabsList>
          {desktopUrl && (
            <TabsContent
              value="desktop"
              className="max-h-[70vh] overflow-y-auto border bg-muted/20"
            >
              {/* Full-page de Storage: next/image exigiría permitir el dominio. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={desktopUrl}
                alt={`Captura desktop de ${title}`}
                className="w-full"
              />
            </TabsContent>
          )}
          {mobileUrl && (
            <TabsContent
              value="mobile"
              className="max-h-[70vh] overflow-y-auto border bg-muted/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mobileUrl}
                alt={`Captura mobile de ${title}`}
                className="mx-auto w-full max-w-[390px]"
              />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
