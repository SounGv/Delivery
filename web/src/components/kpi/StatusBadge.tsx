import { STATUS_COLOR, STATUS_LABEL_TH, type KpiStatus } from "@/lib/status"
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: KpiStatus
  label?: string
  size?: "sm" | "md"
}

export function StatusBadge({ status, label, size = "md" }: StatusBadgeProps) {
  const tone = STATUS_COLOR[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        tone.bg,
        tone.text,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
      {label ?? STATUS_LABEL_TH[status]}
    </span>
  )
}
