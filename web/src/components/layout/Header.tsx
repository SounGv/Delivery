import { useEffect, useState } from "react"
import { Bell, Moon, RefreshCw, Sun, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { useDashboardQuery } from "@/api/queries"
import { useSettings } from "@/lib/settingsContext"
import { TEAM_LABELS, hasOfflineTeam } from "@/lib/dashboard-selectors"
import type { TeamId } from "@/api/types"

const TEAM_ORDER: TeamId[] = ["online", "offline"]

/** Segmented online/offline switcher. Hidden until the payload actually carries an
 * offline crew, so nothing changes on older payloads where everyone is online. */
function TeamSwitcher() {
  const { data } = useDashboardQuery()
  const { selectedTeam, setSelectedTeam } = useSettings()

  if (!data || !hasOfflineTeam(data.employees)) return null

  return (
    <div
      role="group"
      aria-label="เลือกทีม"
      className="hidden items-center rounded-full border border-border bg-muted/40 p-0.5 sm:inline-flex"
    >
      {TEAM_ORDER.map((team) => {
        const active = selectedTeam === team
        return (
          <button
            key={team}
            type="button"
            onClick={() => setSelectedTeam(team)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {TEAM_LABELS[team]}
          </button>
        )
      })}
    </div>
  )
}

interface HeaderProps {
  isConnected: boolean
  isFetching: boolean
  lastUpdated: string | null
  onRefresh: () => void
}

export function Header({ isConnected, isFetching, lastUpdated, onRefresh }: HeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="glass-panel sticky top-0 z-10 flex items-center justify-between gap-4 rounded-none border-x-0 border-t-0 px-4 py-2 md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold text-foreground md:text-lg">Warehouse Dashboard Pro</h1>
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex",
              isConnected ? "bg-emerald-glow/15 text-emerald-glow" : "bg-destructive/15 text-destructive"
            )}
          >
            <span className={cn("size-1.5 rounded-full", isConnected ? "bg-emerald-glow animate-pulse" : "bg-destructive")} />
            {isConnected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          Google Sheets Connected · {now.toLocaleTimeString("th-TH")}
          {lastUpdated && <> · อัปเดตล่าสุด {lastUpdated}</>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <TeamSwitcher />
        <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Refresh">
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="User menu">
              <UserCircle className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>ทีมคลังสินค้า</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Settings (Phase 2)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
