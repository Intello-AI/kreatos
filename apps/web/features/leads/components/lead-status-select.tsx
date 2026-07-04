"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updateLeadStatus } from "@/features/leads/actions"
import { LeadStatusBadge } from "@/features/leads/components/lead-status-badge"
import { LEAD_STATUSES, type LeadStatus } from "@/features/leads/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

/**
 * Status del lead editable en el detalle: José marca a mano ganado/perdido
 * (vendido = "won"); el pipeline automático solo llega a proposal_ready.
 */
export function LeadStatusSelect({
  leadId,
  status,
}: {
  leadId: string
  status: LeadStatus
}) {
  const [current, setCurrent] = useState(status)
  const [pending, startTransition] = useTransition()

  const onChange = (next: string) => {
    const nextStatus = next as LeadStatus
    const previous = current
    setCurrent(nextStatus)
    startTransition(async () => {
      const result = await updateLeadStatus(leadId, nextStatus)
      if (result.formError) {
        setCurrent(previous)
        toast.error(result.formError)
      }
    })
  }

  return (
    <Select value={current} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        className="h-auto gap-1 border-none bg-transparent p-0 shadow-none dark:bg-transparent"
        aria-label="Cambiar status del lead"
      >
        <LeadStatusBadge status={current} />
      </SelectTrigger>
      <SelectContent align="start">
        {LEAD_STATUSES.map((option) => (
          <SelectItem key={option} value={option}>
            <LeadStatusBadge status={option} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
