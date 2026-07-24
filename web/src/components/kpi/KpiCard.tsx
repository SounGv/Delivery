import { motion } from "framer-motion"
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useAnimatedNumber } from "@/lib/useAnimatedNumber"
import { cn } from "@/lib/utils"

interface KpiCardTrend {
  /** Percent change vs. the comparison period. Positive renders green/up, negative renders red/down. */
  value: number
  label?: string
}

interface KpiCardProps {
  title: string
  value: number | null
  icon: LucideIcon
  gradient: string
  suffix?: string
  formatValue?: (n: number) => string
  subtitle?: string
  loading?: boolean
  /** Overrides the animated numeric value with literal text (e.g. a name or a time-of-day). */
  valueText?: string
  trend?: KpiCardTrend
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  gradient,
  suffix,
  formatValue,
  subtitle,
  loading,
  valueText,
  trend,
}: KpiCardProps) {
  const animated = useAnimatedNumber(value ?? 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.35 }}
      className="glass-panel relative overflow-hidden rounded-2xl p-4 shadow-xl shadow-black/10"
    >
      <div className={cn("absolute -right-6 -top-6 size-24 rounded-full opacity-20 blur-2xl", gradient)} />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 truncate text-2xl font-bold tabular-nums text-foreground md:text-3xl">
              {valueText !== undefined
                ? valueText
                : value === null
                  ? "-"
                  : formatValue
                    ? formatValue(animated)
                    : Math.round(animated).toLocaleString("th-TH")}
              {suffix && <span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span>}
            </p>
          )}
          {trend && (
            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-[11px] font-medium",
                trend.value >= 0 ? "text-emerald-glow" : "text-destructive"
              )}
            >
              {trend.value >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {Math.abs(trend.value).toFixed(1)}% {trend.label ?? "เทียบเมื่อวาน"}
            </p>
          )}
          {subtitle && <p className="mt-1 truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-lg", gradient)}>
          <Icon className="size-5" />
        </div>
      </div>
    </motion.div>
  )
}
