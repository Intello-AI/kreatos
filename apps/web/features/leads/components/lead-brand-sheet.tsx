"use client"

import { useState, useTransition } from "react"
import { PaletteIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import {
  getLeadBrand,
  saveLeadBrand,
  type LeadBrandData,
} from "@/features/leads/brand-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

/**
 * Ficha de marca del lead: logo, nombre corto, colores y servicios reales.
 * site-builder la lee al generar — con ficha, el sitio usa la identidad real
 * del negocio en vez de inferirla.
 */
export function LeadBrandSheet({
  leadId,
  leadName,
}: {
  leadId: string
  leadName: string | null
}) {
  const [open, setOpen] = useState(false)
  const [brand, setBrand] = useState<LeadBrandData | null>(null)
  const [loading, startLoading] = useTransition()
  const [saving, startSaving] = useTransition()

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      startLoading(async () => {
        setBrand(await getLeadBrand(leadId))
      })
    }
  }

  const onSubmit = (formData: FormData) => {
    startSaving(async () => {
      const result = await saveLeadBrand(leadId, formData)
      if (result.formError) {
        toast.error(result.formError)
        return
      }
      toast.success("Ficha de marca guardada.")
      setOpen(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ficha de marca">
          <PaletteIcon />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ficha de marca</SheetTitle>
          <SheetDescription>
            {leadName ?? "Lead"} — el agente usa estos datos al generar el
            sitio. Todo es opcional.
          </SheetDescription>
        </SheetHeader>
        {loading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <form action={onSubmit} className="space-y-4 px-4 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand-short-name">Nombre corto (header)</Label>
              <Input
                id="brand-short-name"
                name="short_name"
                defaultValue={brand?.short_name ?? ""}
                placeholder="Zúñiga & Asociados"
              />
              <p className="text-xs text-muted-foreground">
                Lo que va en el header — no la razón social completa.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-logo">Logo</Label>
              <Input
                id="brand-logo"
                name="logo"
                type="file"
                accept=".png,.svg,.jpg,.jpeg,.webp"
              />
              {brand?.logo_path && (
                <p className="text-xs text-muted-foreground">
                  Ya hay un logo cargado; subir otro lo reemplaza.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-colors">Colores de marca</Label>
              <Input
                id="brand-colors"
                name="colors"
                defaultValue={(brand?.colors ?? []).join(", ")}
                placeholder="#0f172a, #b45309"
              />
              <p className="text-xs text-muted-foreground">
                Hex separados por coma; el primero es el dominante.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-tagline">Tagline</Label>
              <Input
                id="brand-tagline"
                name="tagline"
                defaultValue={brand?.tagline ?? ""}
                placeholder="Defensa fiscal sin sorpresas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-services">Servicios reales</Label>
              <Textarea
                id="brand-services"
                name="services"
                rows={4}
                defaultValue={(brand?.services ?? [])
                  .map((s) =>
                    s.description ? `${s.name}: ${s.description}` : s.name
                  )
                  .join("\n")}
                placeholder={"Defensa fiscal: representación ante el SAT\nNómina e IMSS"}
              />
              <p className="text-xs text-muted-foreground">
                Uno por línea, formato “Nombre: descripción”.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-diff">Diferenciadores</Label>
              <Textarea
                id="brand-diff"
                name="differentiators"
                rows={2}
                defaultValue={brand?.differentiators ?? ""}
                placeholder="20 años en La Laguna; atienden ellos, no un call center…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-notes">Notas para el agente</Label>
              <Textarea
                id="brand-notes"
                name="notes"
                rows={2}
                defaultValue={brand?.notes ?? ""}
                placeholder="El dueño odia el azul corporativo…"
              />
            </div>
            <SheetFooter className="px-0">
              <Button type="submit" disabled={saving}>
                {saving && <Spinner />}
                Guardar ficha
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}
