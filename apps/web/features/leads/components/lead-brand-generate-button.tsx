"use client"

import { SparkleIcon } from "@phosphor-icons/react"

import { useActivityPanel } from "@/components/activity-panel"
import { Button } from "@/components/ui/button"

/**
 * Botón "Generar marca": abre el chat del curador y, si el lead tiene sitio
 * actual, AUTO-ENVÍA la URL + la instrucción para extraer la ficha (logo,
 * paleta, voz, servicios) — sin que el humano tenga que picar el chat y pegar
 * la URL. Sin sitio: solo abre el chat para que suba logo/fotos/datos.
 */
export function LeadBrandGenerateButton({
  website,
  label = "Generar marca",
  variant = "default",
  size = "sm",
}: {
  website: string | null
  label?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
}) {
  const { openWith } = useActivityPanel()

  const onClick = () => {
    if (website) {
      openWith(
        `Genera la ficha de marca de este negocio a partir de su sitio web actual: ${website} — recórrelo completo (no solo el home) y extrae logo, colores, tipografía, voz y servicios.`,
      )
    } else {
      // Sin sitio: abre el chat para pasarle logo/fotos/datos a mano.
      openWith()
    }
  }

  return (
    <Button variant={variant} size={size} onClick={onClick}>
      <SparkleIcon weight="fill" />
      {label}
    </Button>
  )
}
