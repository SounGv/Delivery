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
      <div className="glass-panel rounded-2xl p-2 sm:overflow-x-auto">
        <div role="tablist" className="flex flex-wrap gap-2 sm:w-max sm:min-w-full sm:flex-nowrap">
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
                  "flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-extrabold transition-all active:scale-95 max-sm:min-h-11 max-sm:flex-1 max-sm:basis-[calc(50%-0.25rem)] max-sm:px-2 max-sm:py-1.5 max-sm:text-xs sm:shrink-0 sm:whitespace-nowrap",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "border border-border text-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                {Icon && <Icon className="size-5 max-sm:size-4" />}
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
