"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"

/**
 * Capa de sonido de la app: tonos SINTETIZADOS con Web Audio (cero archivos,
 * cero deps). Cubre TODA la interfaz sin cablear cada componente:
 *  - Click en cualquier control (mouse Y teclado) → "tick".
 *  - Abrir/cerrar diálogos y sheets → whoosh (observer de portales en <body>).
 *  - Toasts / alertas (sonner) → success/error/ping según su tipo (observer).
 * El AudioContext se desbloquea en el primer gesto (los navegadores bloquean el
 * audio hasta que el usuario interactúa). Mute persistido en localStorage.
 */

export type SoundName = "click" | "open" | "close" | "success" | "error" | "ping"

type SoundContextValue = {
  play: (name: SoundName) => void
  muted: boolean
  toggleMuted: () => void
}

const SoundContext = createContext<SoundContextValue | null>(null)
const STORAGE_KEY = "kreatos:sound-muted"

type Tone = {
  freq: number
  type?: OscillatorType
  dur: number
  gain?: number
  delay?: number
  slideTo?: number
}

// Recetas cortas y claras (audibles pero no molestas).
const PALETTE: Record<SoundName, Tone[]> = {
  click: [{ freq: 340, dur: 0.03, gain: 0.09 }],
  open: [{ freq: 480, dur: 0.11, gain: 0.11, slideTo: 720 }],
  close: [{ freq: 520, dur: 0.11, gain: 0.11, slideTo: 320 }],
  success: [
    { freq: 660, dur: 0.1, gain: 0.12 },
    { freq: 990, dur: 0.16, gain: 0.12, delay: 0.08 },
  ],
  error: [{ freq: 220, dur: 0.22, gain: 0.13, slideTo: 160 }],
  ping: [{ freq: 900, dur: 0.12, gain: 0.11 }],
}

const INTERACTIVE =
  'button, a[href], [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="option"], summary'
const DIALOG = '[role="dialog"], [role="alertdialog"]'

function hasDialog(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false
  return node.matches(DIALOG) || node.querySelector(DIALOG) !== null
}

function toastSound(el: Element): SoundName {
  const type = el.getAttribute("data-type")
  if (type === "success") return "success"
  if (type === "error") return "error"
  return "ping" // info / warning / default / loading
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null)
  const [muted, setMuted] = useState(false)
  // Ref para que play() sea ESTABLE (no se re-crea al mutear → no re-registra
  // listeners ni re-observa el DOM).
  const mutedRef = useRef(false)

  useEffect(() => {
    let m = false
    try {
      m = localStorage.getItem(STORAGE_KEY) === "1"
    } catch {
      // sin localStorage: default sonando
    }
    mutedRef.current = m
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(m)
  }, [])

  const ensureCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!AC) return null
      ctxRef.current = new AC()
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume()
    return ctxRef.current
  }, [])

  const play = useCallback(
    (name: SoundName) => {
      if (mutedRef.current) return
      const ctx = ensureCtx()
      // Aún suspendido (sin gesto todavía): no programes en un ctx congelado.
      if (!ctx || ctx.state !== "running") return
      const now = ctx.currentTime + 0.001
      for (const t of PALETTE[name]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const start = now + (t.delay ?? 0)
        const g = t.gain ?? 0.1
        osc.type = t.type ?? "sine"
        osc.frequency.setValueAtTime(t.freq, start)
        if (t.slideTo) {
          osc.frequency.exponentialRampToValueAtTime(t.slideTo, start + t.dur)
        }
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(g, start + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + t.dur + 0.03)
      }
    },
    [ensureCtx],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    // Desbloqueo: crea/resume el ctx en el PRIMER gesto de cualquier tipo.
    const unlock = () => ensureCtx()
    // Sonido de interacción en CLICK: cubre mouse Y teclado (Enter/Espacio) y
    // dispara UNA vez por activación.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(INTERACTIVE)
      if (el && !el.closest("[data-no-sound]")) play("click")
    }
    // Toasts/alertas: sonner los añade como [data-sonner-toast] en cualquier
    // parte → observer con subtree, pero SOLO un match barato por nodo.
    const toastObserver = new MutationObserver((muts) => {
      for (const m of muts)
        for (const node of m.addedNodes)
          if (node instanceof HTMLElement && node.matches("[data-sonner-toast]"))
            play(toastSound(node))
    })
    // Diálogos/sheets: Radix portalea a hijos DIRECTOS de <body> → childList sin
    // subtree (barato) capta el montaje/desmontaje del portal.
    const dialogObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) if (hasDialog(node)) play("open")
        for (const node of m.removedNodes) if (hasDialog(node)) play("close")
      }
    })
    window.addEventListener("pointerdown", unlock)
    window.addEventListener("keydown", unlock)
    window.addEventListener("touchstart", unlock, { passive: true })
    window.addEventListener("click", onClick)
    toastObserver.observe(document.body, { childList: true, subtree: true })
    dialogObserver.observe(document.body, { childList: true })
    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
      window.removeEventListener("touchstart", unlock)
      window.removeEventListener("click", onClick)
      toastObserver.disconnect()
      dialogObserver.disconnect()
    }
  }, [ensureCtx, play])

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m
      mutedRef.current = next
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {
        // best-effort
      }
      if (!next) ensureCtx() // desbloquea al re-activar (es un gesto)
      return next
    })
  }, [ensureCtx])

  const value = useMemo(
    () => ({ play, muted, toggleMuted }),
    [play, muted, toggleMuted],
  )
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}

/** Acceso a la capa de sonido. Fuera del provider devuelve no-ops. */
export function useSound(): SoundContextValue {
  return (
    useContext(SoundContext) ?? {
      play: () => {},
      muted: false,
      toggleMuted: () => {},
    }
  )
}

/** Botón de silenciar/activar el sonido (persistido). */
export function SoundToggle() {
  const { muted, toggleMuted } = useSound()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleMuted}
      data-no-sound
      aria-pressed={!muted}
      aria-label={muted ? "Activar sonido" : "Silenciar sonido"}
      title={muted ? "Activar sonido" : "Silenciar sonido"}
    >
      {muted ? <SpeakerSlashIcon /> : <SpeakerHighIcon />}
    </Button>
  )
}
