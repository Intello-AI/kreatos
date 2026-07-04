"use client"

import { useState, useTransition } from "react"

import { createSiteBrief } from "@/features/sites/actions"
import { SITE_PRESETS } from "@/features/sites/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

export function GenerateSiteDialog({
  leadId,
  leadName,
}: {
  leadId: string
  leadName: string | null
}) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<string>("auto")
  const [brandColor, setBrandColor] = useState("")
  const [instructions, setInstructions] = useState("")
  const [contactForm, setContactForm] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const onSubmit = () => {
    setError(undefined)
    startTransition(async () => {
      // redirect() en la action lanza y navega; solo regresa si hubo error.
      const result = await createSiteBrief(leadId, {
        preset: preset as "auto",
        brandColor,
        instructions,
        contactForm,
      })
      if (result?.formError) setError(result.formError)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Generar sitio
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar sitio{leadName ? ` — ${leadName}` : ""}</DialogTitle>
          <DialogDescription>
            El brief se guarda en la base de datos y el agente site-builder
            genera un preview. Tú apruebas antes de publicar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="site-preset">Preset de diseño</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger id="site-preset" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-color">Color de marca (opcional)</Label>
            <Input
              id="site-color"
              placeholder="#1d4e89"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-instructions">
              Instrucciones de estilo (opcional)
            </Label>
            <Textarea
              id="site-instructions"
              placeholder="Tono, referencias, secciones que sí/no, detalles del negocio…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="site-contact-form"
              checked={contactForm}
              onCheckedChange={(v) => setContactForm(v === true)}
            />
            <Label htmlFor="site-contact-form">
              Incluir formulario de contacto (Resend)
            </Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Spinner />}
            Generar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
