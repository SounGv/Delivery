import { NAV_ITEMS } from "./Sidebar"
import { cn } from "@/lib/utils"

interface MobileTabBarProps {
  active: string
  onNavigate: (key: string) => void
}

export function MobileTabBar({ active, onNavigate }: MobileTabBarProps) {
  const items = NAV_ITEMS.filter((item) => item.enabled)

  return (
    <nav className="glass-panel flex gap-1 overflow-x-auto rounded-none border-x-0 border-t-0 px-2 py-2 md:hidden">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = active === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
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
