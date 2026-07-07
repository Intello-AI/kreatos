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
 * cero deps). Dos usos:
 *  - Interacción global: un "tick" suave al hacer click en cualquier control y
 *    un whoosh al abrir/cerrar diálogos/sheets (delegación + MutationObserver;
 *    no hace falta cablear cada componente).
 *  - Notificaciones: success/error/ping desde el realtime (NotificationCenter).
 * Todo respeta un mute persistido y se desbloquea en el primer gesto (los
 * navegadores bloquean el audio hasta que el usuario interactúa).
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

// Recetas cortas, suaves y no molestas.
const PALETTE: Record<SoundName, Tone[]> = {
  click: [{ freq: 320, type: "sine", dur: 0.035, gain: 0.035 }],
  open: [{ freq: 460, type: "sine", dur: 0.1, gain: 0.05, slideTo: 680 }],
  close: [{ freq: 480, type: "sine", dur: 0.1, gain: 0.05, slideTo: 300 }],
  success: [
    { freq: 660, type: "sine", dur: 0.11, gain: 0.06 },
    { freq: 880, type: "sine", dur: 0.16, gain: 0.06, delay: 0.09 },
  ],
  error: [{ freq: 200, type: "sine", dur: 0.2, gain: 0.07, slideTo: 150 }],
  ping: [{ freq: 880, type: "sine", dur: 0.13, gain: 0.05 }],
}

// Selector de controles que suenan al presionarse.
const INTERACTIVE =
  'button, a[href], [role="button"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"], summary, label'
const DIALOG = '[role="dialog"], [role="alertdialog"]'

function hasDialog(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false
  return node.matches(DIALOG) || node.querySelector(DIALOG) !== null
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    // Lectura hidratación-segura de la preferencia (localStorage no existe en
    // SSR): el efecto es el patrón correcto aquí, pese al lint anti-efecto.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMuted(localStorage.getItem(STORAGE_KEY) === "1")
    } catch {
      // sin localStorage: default sonando
    }
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
      if (muted) return
      const ctx = ensureCtx()
      if (!ctx) return
      const now = ctx.currentTime
      for (const t of PALETTE[name]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const start = now + (t.delay ?? 0)
        const g = t.gain ?? 0.05
        osc.type = t.type ?? "sine"
        osc.frequency.setValueAtTime(t.freq, start)
        if (t.slideTo) {
          osc.frequency.exponentialRampToValueAtTime(t.slideTo, start + t.dur)
        }
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(g, start + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + t.dur + 0.02)
      }
    },
    [muted, ensureCtx],
  )

  // Listeners globales de interacción. play() ya respeta `muted`, así que no hace
  // falta re-atar al cambiar el mute (se evita re-registrar en cada toggle).
  const playRef = useRef(play)
  useEffect(() => {
    playRef.current = play
  }, [play])
  useEffect(() => {
    if (typeof window === "undefined") return
    const unlock = () => ensureCtx()
    const onPointerDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(INTERACTIVE)
      if (el && !(el as HTMLElement).hasAttribute("data-no-sound")) {
        playRef.current("click")
      }
    }
    // Radix portalea los diálogos como hijos directos de <body>: basta observar
    // childList del body (sin subtree) — barato y sin falsos positivos.
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes)
          if (hasDialog(node)) playRef.current("open")
        for (const node of m.removedNodes)
          if (hasDialog(node)) playRef.current("close")
      }
    })
    window.addEventListener("pointerdown", unlock, { once: true })
    window.addEventListener("pointerdown", onPointerDown)
    observer.observe(document.body, { childList: true })
    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("pointerdown", onPointerDown)
      observer.disconnect()
    }
  }, [ensureCtx])

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m
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
