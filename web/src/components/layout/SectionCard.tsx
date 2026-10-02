import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Flip7 section: white card whose title sits in an emoji chip above a dashed rule,
 * with an optional right-aligned action slot (filters, tabs, export button). Replaces
 * the ad-hoc `glass-panel p-4` + `<h3>` blocks so every sub-menu lays sections out the same way. */
export function SectionCard({
  emoji,
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  emoji?: string
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("glass-panel rounded-2xl p-4 sm:p-5", className)}>
      <div className="section-title mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {emoji && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold/30 text-lg" aria-hidden>
              {emoji}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-base font-extrabold tracking-wide text-foreground">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
