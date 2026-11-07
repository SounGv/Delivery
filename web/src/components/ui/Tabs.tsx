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
 * an existing page component. Only the active tab is mounted.
 * Flip7 look: one pill-shaped track, the active tab is a teal pill with a glow, and
 * the row scrolls sideways on narrow screens instead of wrapping onto a second line. */
export function Tabs({ items, initialKey }: { items: TabItem[]; initialKey?: string }) {
  const [active, setActive] = useState(initialKey ?? items[0]?.key ?? "")
  const current = items.find((i) => i.key === active) ?? items[0]

  return (
    <div className="space-y-4">
      <div className="glass-panel overflow-x-auto rounded-2xl p-2">
        <div role="tablist" className="flex w-max min-w-full gap-2">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = item.key === active
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(item.key)}
                className={cn(
                  "flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-6 py-3 text-base font-extrabold transition-all active:scale-95",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "border border-border text-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                {Icon && <Icon className="size-5" />}
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
      <div>{current?.render()}</div>
    </div>
  )
}
