import type { Viewport } from "next"
import { Geist_Mono } from "next/font/google"
import localFont from "next/font/local"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const satoshi = localFont({
  src: [
    { path: "../public/fonts/Satoshi-Variable.woff2", style: "normal" },
    { path: "../public/fonts/Satoshi-VariableItalic.woff2", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// maximumScale 1: iOS Safari deja de hacer zoom automático al enfocar
// inputs (los navegadores modernos siguen permitiendo el pinch-zoom manual).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={cn(
        "text-pretty antialiased selection:bg-primary/20 selection:text-primary",
        fontMono.variable,
        "font-sans",
        satoshi.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
