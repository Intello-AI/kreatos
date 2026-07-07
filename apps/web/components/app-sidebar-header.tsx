"use client"

import Link from "next/link"

import { Icon, Logo } from "@/components/icons"
import {
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

const AppSidebarHeader = () => {
  const { state, isMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile

  return (
    <SidebarHeader className="flex h-12 flex-row items-center justify-start">
      {collapsed ? (
        <div className="group/sb-trigger flex h-12 w-full items-center justify-center">
          <Link
            href="/dashboard"
            aria-label="Ir al dashboard"
            className="group-hover/sb-trigger:hidden"
          >
            <Icon aria-hidden className="h-6 w-auto shrink-0" name="Logo" />
          </Link>
          {/* group-focus-within: al tabular al logo, el trigger se revela y
              queda alcanzable por teclado (antes solo aparecía con hover). */}
          <SidebarTrigger
            size={"icon"}
            className="hidden shrink-0 group-hover/sb-trigger:flex group-focus-within/sb-trigger:flex"
          />
        </div>
      ) : (
        <div className="flex h-12 w-full items-center justify-between">
          <Link
            href="/dashboard"
            aria-label="Ir al dashboard"
            className="flex items-center"
          >
            <Logo aria-hidden className="h-5 w-auto" />
          </Link>
          <SidebarTrigger size={"icon"} />
        </div>
      )}
    </SidebarHeader>
  )
}

export { AppSidebarHeader }
