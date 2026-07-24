import type { ReactNode } from "react"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"
import { MobileTabBar } from "./MobileTabBar"

interface AppShellProps {
  children: ReactNode
  isConnected: boolean
  isFetching: boolean
  lastUpdated: string | null
  onRefresh: () => void
  activePage: string
  onNavigate: (key: string) => void
}

export function AppShell({
  children,
  isConnected,
  isFetching,
  lastUpdated,
  onRefresh,
  activePage,
  onNavigate,
}: AppShellProps) {
  return (
    <div className="flex min-h-svh w-full">
      <Sidebar active={activePage} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header isConnected={isConnected} isFetching={isFetching} lastUpdated={lastUpdated} onRefresh={onRefresh} />
        <MobileTabBar active={activePage} onNavigate={onNavigate} />
        <main className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
