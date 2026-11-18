import type { ReprintRow } from "@/api/types"
import { addDaysIso, previousRange, type DateRange, type DayCount, type RankRow } from "@/lib/return-report"

/**
 * Figures for the "ออเดอร์พิมพ์ซ้ำ" page, from the sheet tab "รายงานออเดอร์พิมพ์ซ้ำรายวัน": one row per order whose
 * shipping label was printed more than once on a day, with a details cell like
 *   "ครั้งที่ 1: whan@UJR3010718 2026-11-16 11:39:00 (ระบบทำเครื่องหมายอัตโนมัติ) | ครั้งที่ 2: st_oei@UJR3063161 … (กดพิมพ์เอง)".
 * A row's `date` is the day the prints happened. Nothing here guesses a meaning the sheet does not state: the flags
 * below are plain facts about the times and accounts (see each one).
 */

export type PrintMethod = "manual" | "auto" | "other"

export interface PrintEvent {
  n: number
  /** The account name before the "@", e.g. "st_oei". */
  user: string
  /** The part after the "@", e.g. "UJR3063161". */
  account: string
  date: string
  time: string
  method: PrintMethod
  /** The text in brackets, as the sheet wrote it. */
  methodLabel: string
}

const EVENT_PATTERN = /ครั้งที่\s*(\d+)\s*:\s*(\S+?)@(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s*\(([^)]*)\)/g

export function parsePrintDetails(details: string): PrintEvent[] {
  const out: PrintEvent[] = []
  for (const m of details.matchAll(EVENT_PATTERN)) {
    const label = (m[6] ?? "").trim()
    out.push({
      n: Number(m[1]),
      user: m[2] ?? "",
      account: m[3] ?? "",
      date: m[4] ?? "",
      time: m[5] ?? "",
      method: label.includes("กดพิมพ์เอง") ? "manual" : label.includes("อัตโนมัติ") ? "auto" : "other",
      methodLabel: label,
    })
  }
  return out
}

/** Two prints this close together are almost certainly one press registered twice (e.g. a double click). */
export const RAPID_SECONDS = 60
/** Four prints or more: the sheet used to paint the count red from here (4 and 5 in the sheet). */
export const HEAVY_PRINTS = 4

export interface ReprintCase extends ReprintRow {
  events: PrintEvent[]
  /** How many times it was printed: the sheet's own count column, the number the team uses (owner's decision, 18 Nov
   * 2026). The prints listed in the details are `logLines`; they are used only when the column holds no usable number. */
  prints: number
  /** How many lines the details list (one per press in the log). */
  logLines: number
  /** The count column and the number of detail lines differ (e.g. count 2, six lines listed): both are shown. */
  countMismatch: boolean
  /** Distinct accounts that pressed print, in order of appearance. */
  staff: string[]
  /** Prints pressed by hand / marked by the system. */
  manualPresses: number
  autoMarks: number
  /** Printed HEAVY_PRINTS times or more (by `prints`). */
  heavy: boolean
  /** Some two consecutive prints were at most RAPID_SECONDS apart. */
  rapid: boolean
  /** More than one account printed it. */
  multiStaff: boolean
}

const atMs = (e: PrintEvent) => new Date(`${e.date}T${e.time}`).getTime()

export function toCase(row: ReprintRow): ReprintCase {
  const events = parsePrintDetails(row.details).sort((a, b) => a.n - b.n)
  const staff: string[] = []
  for (const e of events) if (!staff.includes(e.user)) staff.push(e.user)
  const prints = Number.isFinite(row.printCount) && row.printCount > 0 ? row.printCount : events.length
  let rapid = false
  for (let i = 1; i < events.length; i++) {
    const gap = (atMs(events[i]!) - atMs(events[i - 1]!)) / 1000
    if (gap >= 0 && gap <= RAPID_SECONDS) rapid = true
  }
  return {
    ...row,
    events,
    staff,
    prints,
    logLines: events.length,
    countMismatch: events.length > 0 && events.length !== row.printCount,
    manualPresses: events.filter((e) => e.method === "manual").length,
    autoMarks: events.filter((e) => e.method === "auto").length,
    heavy: prints >= HEAVY_PRINTS,
    rapid,
    multiStaff: staff.length > 1,
  }
}

/** The newest day with a row, or null. */
export function latestReprintDate(cases: ReprintCase[]): string | null {
  let latest: string | null = null
  for (const c of cases) if (c.date && (latest === null || c.date > latest)) latest = c.date
  return latest
}

const inRange = (day: string, r: DateRange) => !!day && day >= r.from && day <= r.to

export function casesIn(cases: ReprintCase[], range: DateRange): ReprintCase[] {
  return cases.filter((c) => inRange(c.date, range))
}

export interface ReprintSummary {
  range: DateRange
  orders: number
  ordersBefore: number
  prints: number
  manualPresses: number
  heavy: number
  rapid: number
  multiStaff: number
  /** Orders whose count column differs from the number of lines in their details. */
  countMismatch: number
}

export function summarizeReprints(cases: ReprintCase[], range: DateRange): ReprintSummary {
  const now = casesIn(cases, range)
  const before = casesIn(cases, previousRange(range))
  return {
    range,
    orders: now.length,
    ordersBefore: before.length,
    prints: now.reduce((a, c) => a + c.prints, 0),
    manualPresses: now.reduce((a, c) => a + c.manualPresses, 0),
    heavy: now.filter((c) => c.heavy).length,
    rapid: now.filter((c) => c.rapid).length,
    multiStaff: now.filter((c) => c.multiStaff).length,
    countMismatch: now.filter((c) => c.countMismatch).length,
  }
}

export const NORMAL_LABEL = "พิมพ์ 2–3 ครั้ง"
export const HEAVY_LABEL = `พิมพ์ ${HEAVY_PRINTS} ครั้งขึ้นไป`

/** Orders per day for the `days` days ending on `end`, split into normal and heavy. Days after the newest row are "no data". */
export function dailyReprints(cases: ReprintCase[], end: string, days: number, asOf: string | null): DayCount[] {
  const out: DayCount[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysIso(end, -i)
    out.push({ date, total: 0, byOrigin: {}, noData: !asOf || date > asOf })
  }
  const byDate = new Map(out.map((d) => [d.date, d]))
  for (const c of cases) {
    const d = byDate.get(c.date)
    if (!d) continue
    d.total += 1
    const k = c.heavy ? HEAVY_LABEL : NORMAL_LABEL
    d.byOrigin[k] = (d.byOrigin[k] ?? 0) + 1
  }
  return out
}

/** Who pressed print again most in the period: prints from the second one on, counted per account. */
export function rankPressers(cases: ReprintCase[], range: DateRange, top = 8): { rows: RankRow[]; rest: { names: number; count: number; share: number }; total: number } {
  const counts = new Map<string, number>()
  let total = 0
  for (const c of casesIn(cases, range)) {
    for (const e of c.events) {
      if (e.n < 2) continue
      counts.set(e.user, (counts.get(e.user) ?? 0) + 1)
      total += 1
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const rows = sorted.slice(0, top).map(([name, count]) => ({ name, count, share: pct(count) }))
  const rest = sorted.slice(top)
  const restCount = rest.reduce((a, [, n]) => a + n, 0)
  return { rows, rest: { names: rest.length, count: restCount, share: pct(restCount) }, total }
}

export type ReprintSegment = "all" | "heavy" | "rapid" | "multiStaff"

export function inReprintSegment(c: ReprintCase, seg: ReprintSegment): boolean {
  switch (seg) {
    case "all":
      return true
    case "heavy":
      return c.heavy
    case "rapid":
      return c.rapid
    case "multiStaff":
      return c.multiStaff
  }
}

/** Newest day first, then the most prints first. */
export function sortReprints(list: ReprintCase[]): ReprintCase[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.prints - a.prints || a.packageNo.localeCompare(b.packageNo))
}
