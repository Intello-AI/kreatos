import type { Metadata } from "next"

import { SignUpForm } from "@/features/auth/components/sign-up-form"
import Grainient from "@/components/Grainient"
import Link from "next/link"
import { Logo } from "@/components/icons"
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr"

export const metadata: Metadata = {
  title: "Crear cuenta — Kreatos",
}

export default function SignUpPage() {
  return (
    <main className="grid min-h-dvh w-full grid-cols-1 place-items-center md:grid-cols-2 lg:grid-cols-2">
      <div className="relative hidden h-full w-full md:flex">
        <Grainient
          color1="#00786F"
          color2="#5fa39c"
          color3="#00534d"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
        <div className="absolute inset-0 flex flex-col items-start justify-between md:p-3 lg:p-5">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-background transition-opacity hover:opacity-80"
          >
            <ArrowLeftIcon className="size-6" weight="regular" />
          </Link>
          <div className="w-auto">
            <h2 className="text-base tracking-tight text-background">
              Este producto es desarrollado por{" "}
              <Link
                href="https://intelloai.com?utm_source=kreatos&utm_medium=basic&utm_campaign=kreatos"
                className="underline underline-offset-2 ease-in-out hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Intello"
              >
                Intello
              </Link>
              .
            </h2>
            <p className="text-sm text-background/80">
              {" "}
              Si no eres parte del equipo, por favor, no intentes crear una
              cuenta.
            </p>
          </div>
        </div>
      </div>
      <div className="flex h-full w-full items-center justify-center px-3 md:px-5">
        <div className="mx-auto flex w-full max-w-sm flex-col items-start justify-start gap-7">
          <Logo className="h-6" variant={"logo"} text={"foreground"} />
          <div className="flex w-full flex-col items-start justify-start gap-4">
            <div className="flex flex-col items-start justify-start">
              <h1 className="text-lg font-medium tracking-tight">
                Crea tu cuenta
              </h1>
              <p className="text-sm">Ingresa tus datos para registrarte</p>
            </div>
            <SignUpForm />
          </div>
        </div>
      </div>
    </main>
  )
}
