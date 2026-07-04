"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  approveSite,
  publishSite,
  requestSiteChanges,
} from "@/features/sites/actions"
import type { SiteStatus } from "@/features/sites/types"
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
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ formError?: string }>) => {
    setError(undefined)
    startTransition(async () => {
      const result = await action()
      if (result?.formError) {
        setError(result.formError)
      } else {
        setChanges("")
        router.refresh()
      }
    })
  }

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
          <Button onClick={() => run(() => publishSite(siteId))} disabled={pending}>
            {pending && <Spinner />}
            Publicar
          </Button>
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

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
