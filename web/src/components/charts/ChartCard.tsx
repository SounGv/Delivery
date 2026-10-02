import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface ChartCardProps {
  title: string
  subtitle?: string
  /** Emoji shown in the gold chip left of the title (Flip7 section-title pattern). */
  emoji?: string
  /** Right-aligned slot in the header — period chips, a dropdown, a "more" link. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Chart wrapper in the Flip7 section style: emoji chip + extra-bold title, a dashed rule
 * under the header and an optional action slot (BigSeller-style "range / more" controls). */
export function ChartCard({ title, subtitle, emoji, actions, children, className }: ChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn("glass-panel rounded-2xl p-4 sm:p-5", className)}
    >
      <div className="section-title mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {emoji && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold/30 text-lg" aria-hidden>
              {emoji}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-base font-extrabold tracking-wide text-foreground">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </motion.div>
  )
}

/** Small pill for a ChartCard's `actions` slot, e.g. "14 วันล่าสุด". */
export function ChartChip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{children}</span>
}
