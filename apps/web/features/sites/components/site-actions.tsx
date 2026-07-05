"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowClockwiseIcon,
  CheckIcon,
  PaperPlaneRightIcon,
  RocketLaunchIcon,
  StopIcon,
} from "@phosphor-icons/react"

import {
  approveSite,
  publishSite,
  requestSiteChanges,
  stopSite,
} from "@/features/sites/actions"
import type { SiteStatus } from "@/features/sites/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

export function SiteActions({
  siteId,
  status,
}: {
  siteId: string
  status: SiteStatus
}) {
  const router = useRouter()
  const [changes, setChanges] = useState("")
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ formError?: string }>) => {
    startTransition(async () => {
      const result = await action()
      if (result?.formError) {
        toast.error(result.formError)
      } else {
        setChanges("")
        router.refresh()
      }
    })
  }

  const working = status === "brief" || status === "generating"
  const canRequest = changes.trim().length >= 10
  const isRetry = status === "failed"
  const showComposer =
    status === "preview" || status === "published" || status === "failed"

  // Mientras genera: banner con contexto — el Detener ya no flota suelto bajo
  // el preview, vive en una fila que explica qué está pasando.
  if (working) {
    return (
      <div className="flex items-center justify-between gap-3 border bg-muted/30 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          El agente está generando el sitio…
        </span>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              {pending ? <Spinner /> : <StopIcon />}
              Detener
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Detener la generación?</AlertDialogTitle>
              <AlertDialogDescription>
                El sitio se marca como fallido y podrás relanzarlo. El trabajo
                en curso del agente no se puede abortar, pero ya no podrá
                escribir el estado del sitio.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => stopSite(siteId))}>
                Detener
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {(status === "preview" || status === "approved") && (
        <div className="flex flex-wrap items-center gap-2">
          {status === "preview" && (
            <Button
              onClick={() => run(() => approveSite(siteId))}
              disabled={pending}
            >
              {pending ? <Spinner /> : <CheckIcon />}
              Aprobar versión de producción
            </Button>
          )}

          {status === "approved" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={pending}>
                  {pending ? <Spinner /> : <RocketLaunchIcon />}
                  Publicar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Publicar a producción?</AlertDialogTitle>
                  <AlertDialogDescription>
                    El agente hará merge de la versión aprobada a main y el
                    sitio quedará en vivo en su dominio.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => run(() => publishSite(siteId))}
                  >
                    Publicar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {showComposer && (
        <div className="space-y-1.5">
          <label
            htmlFor="site-changes"
            className="text-xs font-medium text-muted-foreground"
          >
            {isRetry ? "Reintentar la generación" : "Pedir una nueva versión"}
          </label>
          <InputGroup>
            <InputGroupTextarea
              id="site-changes"
              placeholder={
                isRetry
                  ? "Instrucciones para reintentar la generación…"
                  : "Describe los cambios: otra dirección de diseño, ajustes de copy, secciones nuevas…"
              }
              value={changes}
              onChange={(e) => setChanges(e.target.value)}
              rows={3}
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRequest) {
                  e.preventDefault()
                  run(() => requestSiteChanges(siteId, changes))
                }
              }}
            />
            <InputGroupAddon align="block-end">
              <span className="text-[11px] text-muted-foreground">
                {isRetry
                  ? "Se relanza el agente sobre este sitio."
                  : "Crea una rama nueva; la de producción no se toca."}
              </span>
              <InputGroupButton
                size="sm"
                variant="default"
                className="ml-auto"
                disabled={pending || !canRequest}
                onClick={() => run(() => requestSiteChanges(siteId, changes))}
              >
                {pending ? (
                  <Spinner />
                ) : isRetry ? (
                  <ArrowClockwiseIcon />
                ) : (
                  <PaperPlaneRightIcon />
                )}
                {isRetry ? "Reintentar" : "Solicitar cambios"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      )}
    </div>
  )
}
