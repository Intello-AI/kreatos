import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

const LayoutDashboard = async ({ children }: { children: React.ReactNode }) => {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      {/* Skip-link: primer foco tabulable; salta el sidebar (logo + 5 enlaces +
          cerrar sesión) directo al contenido. Oculto hasta recibir foco. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow focus:ring-2 focus:ring-ring"
      >
        Saltar al contenido
      </a>
      <AppSidebar />
      <SidebarInset id="main-content" tabIndex={-1} className="outline-none">
        {/* Oculto en /dashboard: el chat pone su propio header h-12. */}
        <DashboardHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default LayoutDashboard
