"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SignOutIcon,
  SquaresFourIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"

import { logout } from "@/features/auth/actions"
import { Icon, Logo } from "@/components/icons"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: SquaresFourIcon,
  },
  {
    title: "Leads",
    href: "/dashboard/leads",
    icon: UsersThreeIcon,
  },
]

const AppSidebar = (props: React.ComponentProps<typeof Sidebar>) => {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Icon className="h-6 w-5 shrink-0" />
          <Logo className="h-4 w-auto group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Cerrar sesión" onClick={() => logout()}>
              <SignOutIcon />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export { AppSidebar }
