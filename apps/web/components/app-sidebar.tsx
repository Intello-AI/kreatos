"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  GlobeIcon,
  SignOutIcon,
  SquaresFourIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"

import { logout } from "@/features/auth/actions"
import { AppSidebarHeader } from "@/components/app-sidebar-header"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  {
    title: "Sitios",
    href: "/dashboard/sites",
    icon: GlobeIcon,
  },
]

const AppSidebar = (props: React.ComponentProps<typeof Sidebar>) => {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href)

  return (
    <Sidebar collapsible="icon" {...props}>
      <AppSidebarHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
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
