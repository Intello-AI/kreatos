"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Logo } from "@/components/icons"
import { SidebarTrigger } from "@/components/ui/sidebar"

import { PendingQuestionsBell } from "@/features/notifications/components/pending-questions-bell"

/**
 * Header global del dashboard. En `/dashboard` (el chat) no se renderiza:
 * el chat trae su propio header (selector de conversaciones + nueva) que
 * ocupa ese lugar con la misma altura h-12.
 */
export function DashboardHeader() {
  const pathname = usePathname()
  if (pathname === "/dashboard") return null

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-2">
      {/* En mobile el sidebar es un Sheet cerrado: sin este trigger no
          hay forma de abrirlo. En desktop el trigger vive en el sidebar. */}
      <SidebarTrigger size="icon" className="md:hidden" />
      <Link
        href="/dashboard"
        aria-label="Ir al dashboard"
        className="flex items-center md:hidden"
      >
        <Logo className="h-5 w-auto" />
      </Link>
      <div className="ml-auto">
        <PendingQuestionsBell />
      </div>
    </header>
  )
}
