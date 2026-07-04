"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "preview" && (
          <Button onClick={() => run(() => approveSite(siteId))} disabled={pending}>
            {pending && <Spinner />}
            Aprobar
          </Button>
        )}

        {status === "approved" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={pending}>
                {pending && <Spinner />}
                Publicar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Publicar a producción?</AlertDialogTitle>
                <AlertDialogDescription>
                  El agente hará merge de la versión aprobada a main y el sitio
                  quedará en vivo en su dominio.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(() => publishSite(siteId))}>
                  Publicar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {working && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={pending}>
                {pending && <Spinner />}
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
        )}
      </div>

      {(status === "preview" || status === "published" || status === "failed") && (
        <div className="space-y-2">
          <Textarea
            placeholder={
              status === "failed"
                ? "Instrucciones para reintentar la generación…"
                : "Pide cambios para una nueva versión…"
            }
            value={changes}
            onChange={(e) => setChanges(e.target.value)}
            rows={3}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={pending || changes.trim().length < 10}
            onClick={() => run(() => requestSiteChanges(siteId, changes))}
          >
            {pending && <Spinner />}
            {status === "failed" ? "Reintentar" : "Solicitar cambios"}
          </Button>
        </div>
      )}

    </div>
  )
}
