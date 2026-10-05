import { formatNumber } from "@/lib/format"
import type { EmployeeMetric } from "@/lib/workforce"

/** Raw BigSeller columns shown as the small "PDA / ป้าย / Wave / SKU" breakdown under a person. */
export type BreakdownStatKey = "pdaPick" | "printLabel" | "pickWaveCount" | "pickSku"

const STATS: { key: BreakdownStatKey; label: string }[] = [
  { key: "pdaPick", label: "PDA" },
  { key: "printLabel", label: "ป้าย" },
  { key: "pickWaveCount", label: "Wave" },
  { key: "pickSku", label: "SKU" },
]

/** The breakdown for one person, minus `hide` — the figure the ranking is already sorted by is
 * printed as the headline number, so repeating it in the small line would just duplicate it.
 * Empty for rankings whose source has no BigSeller breakdown (pdaPick undefined). */
export function breakdownStats(m: EmployeeMetric, hide?: string): { label: string; value: string }[] {
  if (m.pdaPick === undefined) return []
  return STATS.filter((s) => s.key !== hide).map((s) => ({ label: s.label, value: formatNumber(m[s.key] ?? 0) }))
}
