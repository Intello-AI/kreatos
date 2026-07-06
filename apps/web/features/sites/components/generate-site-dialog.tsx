"use client"

import { useState, useTransition } from "react"
import { PaletteIcon } from "@phosphor-icons/react"

import { createSiteBrief } from "@/features/sites/actions"
import { listAnalyzedReferences } from "@/features/references/actions"
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

/**
 * Brief mínimo: la identidad visual ya no se elige aquí — sale de la ficha
 * de marca del lead y de las referencias analizadas (el theme se deriva, no
 * se escoge de un catálogo). Aquí solo va la referencia guía (opcional),
 * instrucciones y el contact form.
 */
export function GenerateSiteDialog({
  leadId,
  leadName,
}: {
  leadId: string
  leadName: string | null
}) {
  const [open, setOpen] = useState(false)
  const [references, setReferences] = useState<
    Array<{ slug: string; url: string }>
  >([])
  const [referenceSlug, setReferenceSlug] = useState<string>("auto")
  const [instructions, setInstructions] = useState("")
  const [contactForm, setContactForm] = useState(false)
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "both">("both")
  const [whatsappFloat, setWhatsappFloat] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const [loadingRefs, startLoadingRefs] = useTransition()

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      startLoadingRefs(async () => {
        setReferences(await listAnalyzedReferences())
      })
    }
  }

  const onSubmit = () => {
    setError(undefined)
    startTransition(async () => {
      // redirect() en la action lanza y navega; solo regresa si hubo error.
      const result = await createSiteBrief(leadId, {
        referenceSlug: referenceSlug === "auto" ? "" : referenceSlug,
        instructions,
        contactForm,
        themeMode,
        whatsappFloat,
      })
      if (result?.formError) setError(result.formError)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Generar sitio
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Generar sitio{leadName ? ` — ${leadName}` : ""}
          </DialogTitle>
          <DialogDescription>
            El agente diseña con la ficha de marca del lead y la biblioteca de
            referencias; genera un preview y tú apruebas antes de publicar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 border border-dashed p-2.5 text-xs text-muted-foreground">
            <PaletteIcon className="mt-0.5 size-3.5 shrink-0" />
            <p>
              Logo, colores, fotos y voz salen de la <b>ficha de marca</b> del
              lead (icono de paleta en la tabla). Llénala antes de generar
              para un resultado a la medida.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-reference">Referencia guía (opcional)</Label>
            <Select value={referenceSlug} onValueChange={setReferenceSlug}>
              <SelectTrigger id="site-reference" className="w-full">
                <SelectValue
                  placeholder={loadingRefs ? "Cargando…" : "Automática"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Automática (el agente elige de la biblioteca)
                </SelectItem>
                {references.map((ref) => (
                  <SelectItem key={ref.slug} value={ref.slug}>
                    {ref.url.replace(/^https?:\/\/(www\.)?/, "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-instructions">
              Instrucciones de estilo (opcional)
            </Label>
            <Textarea
              id="site-instructions"
              placeholder="Tono, secciones que sí/no, detalles del negocio…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Configuración</p>

            <div className="space-y-2">
              <Label htmlFor="site-theme-mode">Tema</Label>
              <Select
                value={themeMode}
                onValueChange={(v) =>
                  setThemeMode(v as "light" | "dark" | "both")
                }
              >
                <SelectTrigger id="site-theme-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Claro</SelectItem>
                  <SelectItem value="dark">Oscuro</SelectItem>
                  <SelectItem value="both">Ambos (con selector)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Claro/Oscuro fija el modo; Ambos muestra un botón para cambiar.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="site-whatsapp-float"
                  checked={whatsappFloat}
                  onCheckedChange={(v) => setWhatsappFloat(v === true)}
                />
                <Label htmlFor="site-whatsapp-float">
                  Botón flotante de WhatsApp
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Requiere WhatsApp en la ficha del negocio.
              </p>
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
