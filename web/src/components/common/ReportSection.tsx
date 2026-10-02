import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ReportSectionProps {
  title?: string
  subtitle?: string
  /** Emoji shown in the gold chip left of the title (Flip7 section-title pattern). */
  emoji?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Shared section wrapper (title + optional subtitle/actions + body), replacing
 * the `glass-panel rounded-2xl p-4` + manual `<h3>` block repeated across pages.
 * Flip7 look: extra-bold title with a dashed rule under the header. */
export function ReportSection({ title, subtitle, emoji, actions, children, className }: ReportSectionProps) {
  return (
    <div className={cn("glass-panel rounded-2xl p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="section-title mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {emoji && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold/30 text-lg" aria-hidden>
                {emoji}
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-base font-extrabold tracking-wide text-foreground">{title}</h3>}
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}
