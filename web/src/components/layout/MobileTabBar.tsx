import { NAV_ITEMS } from "./Sidebar"
import { cn } from "@/lib/utils"

interface MobileTabBarProps {
  active: string
  onNavigate: (key: string) => void
}

export function MobileTabBar({ active, onNavigate }: MobileTabBarProps) {
  const items = NAV_ITEMS.filter((item) => item.enabled)

  return (
    <nav className="glass-panel topbar-surface flex gap-2 overflow-x-auto rounded-none border-x-0 border-t-0 px-2 py-2.5 md:hidden">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = active === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-all",
              isActive
                ? "bg-gradient-to-r from-[#17706b] to-[#1a7f79] text-white shadow-[0_8px_18px_-8px_rgba(23,112,107,0.9),inset_0_1px_0_rgba(255,255,255,0.28)]"
                : "btn-raised text-foreground/80 hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
