import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface TabItem {
  key: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  render: () => ReactNode
}

/** Lightweight tab switcher used to merge related pages into one menu entry
 * (e.g. KPI + Ranking) without duplicating their logic — each tab just renders
 * an existing page component. Only the active tab is mounted. */
export function Tabs({ items, initialKey }: { items: TabItem[]; initialKey?: string }) {
  const [active, setActive] = useState(initialKey ?? items[0]?.key ?? "")
  const current = items.find((i) => i.key === active) ?? items[0]

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap gap-1 rounded-2xl p-1.5">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.key === active
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActive(item.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              {Icon && <Icon className="size-4" />}
              {item.label}
            </button>
          )
        })}
      </div>
      <div>{current?.render()}</div>
    </div>
  )
}
