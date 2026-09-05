/**
 * Single source of truth for the app-wide employee-performance status color
 * system: green = on target/normal, amber = near target/watch, red = below
 * target persistently, grey = no data / not on shift / not assigned.
 *
 * Thresholds (100% / 80%) match the pre-existing `progressTone` logic in
 * LiveWarehouse.tsx — this centralizes it, it does not change the rule.
 */
export type KpiStatus = "on-target" | "watch" | "below-target" | "no-data" | "no-target"

export const STATUS_LABEL_TH: Record<KpiStatus, string> = {
  "on-target": "ถึงเป้าหมาย",
  watch: "ใกล้เป้าหมาย",
  "below-target": "ต่ำกว่าเป้า",
  "no-data": "ไม่มีข้อมูล",
  "no-target": "มีข้อมูล ไม่มีเป้าต่อคน",
}

export const STATUS_COLOR: Record<KpiStatus, { bg: string; text: string; dot: string }> = {
  "on-target": { bg: "bg-emerald-glow/15", text: "text-emerald-glow", dot: "bg-emerald-glow" },
  watch: { bg: "bg-amber-500/15", text: "text-amber-500", dot: "bg-amber-500" },
  "below-target": { bg: "bg-destructive/15", text: "text-destructive", dot: "bg-destructive" },
  "no-data": { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  "no-target": { bg: "bg-sky-500/15", text: "text-sky-400", dot: "bg-sky-400" },
}

/**
 * `hasData` must be false only when there's genuinely no record for the
 * period (on leave, not scheduled, sheet data missing) — not when someone
 * worked and scored 0, which is a real `below-target` case. Callers must
 * distinguish "no shift" from "low output" themselves before calling this.
 *
 * A team/category with no numeric per-person target (e.g. offline production
 * before a target is set in the sheet) must resolve to `no-target`, not
 * `no-data` — the person worked, we just can't score them against a target
 * that doesn't exist. Conflating the two mislabels real work as "absent".
 */
export function classifyKpiStatus(pctTarget: number | null, hasData: boolean): KpiStatus {
  if (!hasData) return "no-data"
  if (pctTarget === null) return "no-target"
  if (pctTarget >= 100) return "on-target"
  if (pctTarget >= 80) return "watch"
  return "below-target"
}
