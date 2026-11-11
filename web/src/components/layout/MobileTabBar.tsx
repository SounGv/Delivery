import { useEffect, useState } from "react"
import { LayoutGrid, X } from "lucide-react"
import { NAV_GROUPS, NAV_ITEMS, isActiveNav, type NavItem } from "./Sidebar"
import { cn } from "@/lib/utils"

interface MobileTabBarProps {
  active: string
  onNavigate: (key: string) => void
}

/** The four pages staff open most, shown on the bar itself; everything else is behind the centre "เมนู" button. */
const QUICK_KEYS = ["dashboard", "team-online", "sales-summary", "backlog"]
const LEFT = QUICK_KEYS.slice(0, 2)
const RIGHT = QUICK_KEYS.slice(2)

/** Phone navigation: a bar fixed to the bottom (thumb reach) with a raised centre button that opens every page as an
 * icon grid. Hidden from the md breakpoint up, where the side menu takes over. */
export function MobileTabBar({ active, onNavigate }: MobileTabBarProps) {
  const [open, setOpen] = useState(false)
  const byKey = (key: string) => NAV_ITEMS.find((i) => i.key === key)
  const activeIsQuick = QUICK_KEYS.some((k) => isActiveNav(active, k))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const go = (key: string) => {
    setOpen(false)
    onNavigate(key)
  }

  const slot = (item: NavItem | undefined) => {
    if (!item) return null
    const Icon = item.icon
    const isActive = isActiveNav(active, item.key)
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => go(item.key)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex min-h-12 flex-1 flex-col items-center justify-center gap-0 px-0.5 text-[10px] font-bold transition-colors",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
      >
        <span className={cn("flex h-6 w-10 items-center justify-center rounded-full transition-colors", isActive && "bg-primary/15")}>
          <Icon className="size-4" />
        </span>
        <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
      </button>
    )
  }

  return (
    <div className="md:hidden">
      <nav
        aria-label="เมนูหลัก"
        className="glass-panel topbar-surface fixed inset-x-0 bottom-0 z-30 flex items-end rounded-none border-x-0 border-b-0 px-1 pb-[env(safe-area-inset-bottom)]"
      >
        {LEFT.map((k) => slot(byKey(k)))}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="เปิดเมนูทั้งหมด"
            className={cn(
              "-mt-4 flex size-11 flex-col items-center justify-center rounded-full text-white shadow-[0_8px_16px_-6px_rgba(23,112,107,0.9),inset_0_1px_0_rgba(255,255,255,0.3)] ring-[3px] ring-background transition-transform active:scale-95",
              "bg-gradient-to-br from-[#17706b] to-[#1a7f79]",
              !activeIsQuick && "ring-primary/40"
            )}
          >
            <LayoutGrid className="size-4" />
            <span className="text-[9px] font-bold leading-none">เมนู</span>
          </button>
        </div>
        {RIGHT.map((k) => slot(byKey(k)))}
      </nav>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-label="เมนูทั้งหมด">
          <button type="button" aria-label="ปิดเมนู" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="glass-panel relative max-h-[80svh] w-full overflow-y-auto rounded-b-none rounded-t-3xl px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-extrabold text-foreground">เมนูทั้งหมด</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิดเมนู"
                className="btn-raised flex size-9 items-center justify-center text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {NAV_GROUPS.map((group) => (
              <div key={group.section} className="mb-3">
                <p className="mb-1.5 text-[10px] font-bold tracking-wide text-muted-foreground">{group.section}</p>
                <div className="grid grid-cols-4 gap-2">
                  {group.items
                    .filter((item) => item.enabled)
                    .map((item) => {
                      const Icon = item.icon
                      const isActive = isActiveNav(active, item.key)
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => go(item.key)}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] font-bold transition-all active:scale-95",
                            isActive
                              ? "bg-gradient-to-br from-[#17706b] to-[#1a7f79] text-white shadow-[0_10px_20px_-10px_rgba(23,112,107,0.9)]"
                              : "btn-raised text-foreground"
                          )}
                        >
                          <Icon className={cn("size-5", isActive ? "text-white" : "text-primary")} />
                          <span className="leading-tight">{item.label}</span>
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
