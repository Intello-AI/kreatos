"use client"

import Link from "next/link"

import { cn } from "@/lib/utils"
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
      <Link
        href="/dashboard"
        className={cn(
          "flex h-12 w-full items-center",
          collapsed && "justify-center"
        )}
      >
        {collapsed ? (
          <div className="group/sb-trigger">
            <Icon
              className="h-6 w-auto shrink-0 group-hover/sb-trigger:hidden"
              name="Logo"
            />
            <SidebarTrigger
              size={"icon"}
              className="hidden shrink-0 group-hover/sb-trigger:flex"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <Logo className="h-5 w-auto" />
            <SidebarTrigger size={"icon"} />
          </div>
        )}
      </Link>
    </SidebarHeader>
  )
}

export { AppSidebarHeader }
