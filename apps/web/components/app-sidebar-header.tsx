"use client"

import Link from "next/link"

import { cn } from "@/lib/utils"
import { Icon, Logo } from "@/components/icons"
import { SidebarHeader, useSidebar } from "@/components/ui/sidebar"

const AppSidebarHeader = () => {
  const { state, isMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile

  return (
    <SidebarHeader>
      <Link
        href="/dashboard"
        className={cn(
          "flex h-12 items-center px-2",
          collapsed && "justify-center px-0"
        )}
      >
        {collapsed ? (
          <Icon className="h-6 w-5 shrink-0" />
        ) : (
          <Logo className="h-4 w-auto" />
        )}
      </Link>
    </SidebarHeader>
  )
}

export { AppSidebarHeader }
