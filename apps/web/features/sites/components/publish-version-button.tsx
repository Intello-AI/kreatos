"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RocketLaunchIcon } from "@phosphor-icons/react"

import { publishSiteVersion } from "@/features/sites/actions"
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

/**
 * Promueve ESTA versión-rama a producción. Aparece por card de versión en
 * preview: el humano elige a mano cuál dirección sube, aunque haya varias
 * versionándose a la vez. El merge lo hace el agente (site-manager).
 */
export function PublishVersionButton({
  siteId,
  versionN,
}: {
  siteId: string
  versionN: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const publish = () => {
    startTransition(async () => {
      const result = await publishSiteVersion(siteId, versionN)
      if (result?.formError) {
        toast.error(result.formError)
      } else {
        toast.success(`Publicación de v${versionN} solicitada al agente.`)
        router.refresh()
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={pending}>
          {pending ? <Spinner /> : <RocketLaunchIcon />}
          Publicar esta versión
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Publicar la v{versionN} a producción?</AlertDialogTitle>
          <AlertDialogDescription>
            El agente hará merge de la rama v{versionN} a main y esta versión
            reemplazará a la que esté en vivo en el dominio. Las demás versiones
            siguen en preview.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={publish}>Publicar v{versionN}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
