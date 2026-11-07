import type { BacklogAlert, BacklogRow } from "@/api/types"

export type AgeBand = "none" | "ok" | "warn" | "bad"

/** The sheet's own colouring of "ค้างมาแล้ว": green 0-3 days, yellow 4-14, red over 14
 * (red = chase first). `null` means the source has no start date. */
export function ageBand(days: number | null): AgeBand {
  if (days === null) return "none"
  if (days <= 3) return "ok"
  if (days <= 14) return "warn"
  return "bad"
}

/** Longest-waiting first; lines with no start date (null) go last. */
export function sortByAge(rows: BacklogRow[]): BacklogRow[] {
  return [...rows].sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
}

/** Sorted distinct non-empty values of one text field, for filter choices. */
export function distinctTexts(rows: BacklogRow[], pick: (row: BacklogRow) => string): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const value = pick(r)
    if (value) set.add(value)
  }
  return [...set].sort()
}

/** Lines per queue number, from the detail rows (the sheet's summary is the source of
 * truth for the cards; this is only used to label the filter). */
export function countByQueue(rows: BacklogRow[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const r of rows) counts.set(r.queueNo, (counts.get(r.queueNo) ?? 0) + 1)
  return counts
}

export function sumValueBaht(rows: BacklogRow[]): number {
  return rows.reduce((sum, r) => sum + (r.valueBaht ?? 0), 0)
}

/** Count on the sheet's top-level alert line whose label contains `needle` (e.g. "เลยกำหนด"); 0 when absent. */
export function alertCount(alerts: BacklogAlert[], needle: string): number {
  const found = alerts.find((a) => !a.nested && a.label.includes(needle))
  return found?.count ?? 0
}
