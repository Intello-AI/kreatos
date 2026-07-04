import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const LayoutDashboard = async ({ children }: { children: React.ReactNode }) => {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 bg-sidebar sticky top-0 z-10">
          {/* En mobile el sidebar es un Sheet cerrado: sin este trigger no
              hay forma de abrirlo. En desktop el trigger vive en el sidebar. */}
          <SidebarTrigger size="icon" className="md:hidden" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default LayoutDashboard
