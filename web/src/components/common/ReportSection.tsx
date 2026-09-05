import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ReportSectionProps {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Shared section wrapper (title + optional subtitle/actions + body), replacing
 * the `glass-panel rounded-2xl p-4` + manual `<h3>` block repeated across pages. */
export function ReportSection({ title, subtitle, actions, children, className }: ReportSectionProps) {
  return (
    <div className={cn("glass-panel rounded-2xl p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}
