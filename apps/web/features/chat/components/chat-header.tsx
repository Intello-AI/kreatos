"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { CaretDownIcon, ChatCircleDotsIcon, PlusIcon } from "@phosphor-icons/react"

import { type ChatConversation } from "@/features/chat/actions"
import { NotificationCenter } from "@/features/notifications/components/notification-center"
import { SoundToggle } from "@/features/sound/sound-provider"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatRelative } from "@/lib/dates"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { SidebarTrigger } from "@/components/ui/sidebar"

/**
 * Header del chat (sustituye al header global del layout en /dashboard):
 * misma altura h-12, trigger del sidebar en mobile, selector de
 * conversaciones (dropdown en desktop, sheet en mobile) y nueva conversación.
 */
export function ChatHeader({
  current,
  recent,
}: {
  /** Conversación abierta; undefined en el home (nueva conversación). */
  current?: ChatConversation
  recent: ChatConversation[]
}) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const label = current?.title ?? "Nueva conversación"

  const selectorButton = (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 min-w-0 justify-start gap-1.5 px-2 font-medium"
    >
      <span className="truncate">{label}</span>
      <CaretDownIcon className="size-3 shrink-0 text-muted-foreground" />
    </Button>
  )

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-sidebar px-2">
      <div className="flex min-w-0 items-center gap-1">
        {/* En mobile el sidebar es un Sheet cerrado: este es su trigger. */}
        <SidebarTrigger size="icon" className="md:hidden" />
        {recent.length === 0 ? (
          <span className="truncate px-2 text-sm font-medium">{label}</span>
        ) : isMobile ? (
          <Sheet>
            <SheetTrigger asChild>{selectorButton}</SheetTrigger>
            <SheetContent side="bottom" className="max-h-[70dvh] gap-0 p-0">
              <SheetHeader className="border-b">
                <SheetTitle>Conversaciones</SheetTitle>
              </SheetHeader>
              <ul className="divide-y overflow-y-auto">
                {recent.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/dashboard?c=${item.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ChatCircleDotsIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm">{item.title}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(item.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{selectorButton}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {recent.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => router.push(`/dashboard?c=${item.id}`)}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate">{item.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelative(item.updated_at)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <SoundToggle />
        <NotificationCenter />
      </div>
      {current && (
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          aria-label="Nueva conversación"
        >
          <Link href="/dashboard">
            <PlusIcon />
          </Link>
        </Button>
      )}
    </header>
  )
}
