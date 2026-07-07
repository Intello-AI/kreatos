"use client"

import { useState, useTransition } from "react"
import { PaletteIcon } from "@phosphor-icons/react"

import { createSiteBrief } from "@/features/sites/actions"
import { listAnalyzedReferences } from "@/features/references/actions"
import { LANGUAGE_LABELS, LANGUAGES } from "@/features/leads/types"
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
import { useIsMobile } from "@/hooks/use-mobile"

/**
 * Brief mínimo: la identidad visual ya no se elige aquí — sale de la ficha
 * de marca del lead y de las referencias analizadas (el theme se deriva, no
 * se escoge de un catálogo). Aquí solo va la referencia guía (opcional),
 * instrucciones y el contact form.
 */
export function GenerateSiteDialog({
  leadId,
  leadName,
  leadLanguage = "es",
}: {
  leadId: string
  leadName: string | null
  /** Idioma primario del cliente (columna del lead): preselecciona el default. */
  leadLanguage?: string
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
  // Idioma DEFAULT del sitio (locales[0], vive en "/" sin prefijo). Se
  // preselecciona con el idioma del cliente guardado en el lead; José lo puede
  // cambiar aquí. Los idiomas EXTRA se marcan aparte (URL /<locale>).
  const [defaultLocale, setDefaultLocale] = useState<string>(leadLanguage)
  const [extraLocales, setExtraLocales] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const [loadingRefs, startLoadingRefs] = useTransition()
  // Mobile: el diálogo se aprieta y desborda → se muestra como Sheet inferior.
  // Desktop: diálogo (más ancho, layout en 2 columnas).
  const isMobile = useIsMobile()

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      startLoadingRefs(async () => {
        setReferences(await listAnalyzedReferences())
      })
    }
  }

  const toggleExtraLocale = (code: string, on: boolean) =>
    setExtraLocales((prev) =>
      on ? [...prev, code] : prev.filter((c) => c !== code),
    )

  // Cambiar el default nunca lo deja también como "extra" (sería duplicado).
  const onDefaultChange = (next: string) => {
    setDefaultLocale(next)
    setExtraLocales((prev) => prev.filter((c) => c !== next))
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
        // default primero (sin prefijo en "/"); luego los extra elegidos.
        locales: [
          defaultLocale,
          ...extraLocales.filter((c) => c !== defaultLocale),
        ],
      })
      if (result?.formError) setError(result.formError)
    })
  }

  const titleText = `Generar sitio${leadName ? ` — ${leadName}` : ""}`
  const descriptionText =
    "El agente diseña con la ficha de marca del lead y la biblioteca de referencias; genera un preview y tú apruebas antes de publicar."

  const trigger = (
    <Button variant="outline" size="sm">
      Generar sitio
    </Button>
  )

  const submitButton = (
    <Button
      onClick={onSubmit}
      disabled={pending}
      className="w-full sm:w-auto"
    >
      {pending && <Spinner />}
      Generar
    </Button>
  )

  const formBody = (
    <div className="space-y-4">
      <div className="flex items-start gap-2 border border-dashed p-2.5 text-xs text-muted-foreground">
        <PaletteIcon className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Logo, colores, fotos y voz salen de la <b>ficha de marca</b> del lead
          (icono de paleta en la tabla). Llénala antes de generar para un
          resultado a la medida.
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

        {/* En desktop los dos selects van lado a lado; en mobile se apilan. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="site-theme-mode">Tema</Label>
            <Select
              value={themeMode}
              onValueChange={(v) => setThemeMode(v as "light" | "dark" | "both")}
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

          <div className="space-y-2">
            <Label htmlFor="site-default-locale">Idioma principal</Label>
            <Select value={defaultLocale} onValueChange={onDefaultChange}>
              <SelectTrigger id="site-default-locale" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Es el idioma por defecto: vive en <code>/</code> sin prefijo.
              Preseleccionado con el idioma del cliente guardado en el lead.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Idiomas adicionales</Label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {LANGUAGES.filter((code) => code !== defaultLocale).map((code) => (
              <div key={code} className="flex items-center gap-2">
                <Checkbox
                  id={`site-locale-${code}`}
                  checked={extraLocales.includes(code)}
                  onCheckedChange={(v) => toggleExtraLocale(code, v === true)}
                />
                <Label htmlFor={`site-locale-${code}`}>
                  {LANGUAGE_LABELS[code]}
                </Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Cada extra genera su versión con URL propia (
            <code>/{LANGUAGES.find((c) => c !== defaultLocale) ?? "en"}</code>
            , …).
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
  )

  // Mobile: Sheet inferior, header/footer fijos y el form scrollea en medio.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[92dvh] gap-0 p-0">
          <SheetHeader className="shrink-0 border-b">
            <SheetTitle>{titleText}</SheetTitle>
            <SheetDescription>{descriptionText}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {formBody}
          </div>
          <SheetFooter className="shrink-0 border-t">{submitButton}</SheetFooter>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: diálogo más ancho; el cuerpo scrollea si es alto.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b p-4">
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {formBody}
        </div>
        <DialogFooter className="shrink-0 border-t p-4">
          {submitButton}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
