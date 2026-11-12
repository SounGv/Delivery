import { LOST_PAID, needsAction, type LostStage, type TimelineItem } from "@/lib/cancel-return-timeline"

/**
 * Figures for the "สรุปตีกลับและเงินคืน" page, from the same merged lines as the period report
 * (buildTimelineItems), so the two pages cannot disagree.
 *
 * What each figure means:
 *  - received    returned goods (not lost) whose "เวลาถึงคลัง" falls in the period
 *  - outstanding returned goods still to stock in, right now — not tied to the period
 *  - lost        lost parcels whose date (request date, else arrival day) falls in the period
 *  - the money of refund cases, by stage (see LostStage): the three that still need someone (not started, claim open,
 *    money in but not noted) are counted right now across all dates — they are open work, and most of them have no date —
 *    while "paid" is counted by the period
 *  - cancelled orders, in the two kinds the warehouse works with: stock already deducted (goods must come back) and
 *    not yet deducted (goods must be put back); counted by the order's date, with the ones still to chase
 * Lines without a date (refund-only lines) can never fall in a period, so they are counted apart.
 */

export type PeriodPreset = "today" | "yesterday" | "7d" | "month" | "custom"

export interface DateRange {
  from: string
  to: string
}

const DAY_MS = 86_400_000

const toMs = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDaysIso = (iso: string, days: number) => toIso(toMs(iso) + days * DAY_MS)
export const daysBetweenIso = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY_MS)

/** The newest day the returns data knows about (a line's date or arrival day), or null when there is none.
 * Cancelled orders are left out: they are read from live formulas up to today, while the returns come from an
 * exported file that can be days behind, and "how fresh is the returns data" is what this answers. */
export function latestDataDate(items: TimelineItem[]): string | null {
  let latest: string | null = null
  for (const it of items) {
    if (it.kind === "cancel") continue
    for (const d of [it.date, it.arrivedOn]) if (d && (latest === null || d > latest)) latest = d
  }
  return latest
}

/**
 * The inclusive date range for a preset. "7d" ends on the newest day that has data (`asOf`), not on the calendar
 * day, because the sheet is refreshed from a file and can be days behind — a calendar-day window would show 0.
 */
export function rangeFor(preset: PeriodPreset, today: string, asOf: string | null, custom?: DateRange): DateRange {
  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const y = addDaysIso(today, -1)
      return { from: y, to: y }
    }
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case "custom": {
      const from = custom?.from || custom?.to || today
      const to = custom?.to || custom?.from || today
      return from <= to ? { from, to } : { from: to, to: from }
    }
    case "7d": {
      const end = asOf && asOf < today ? asOf : today
      return { from: addDaysIso(end, -6), to: end }
    }
  }
}

/** The range of the same length immediately before `range`. */
export function previousRange(range: DateRange): DateRange {
  const length = daysBetweenIso(range.from, range.to) + 1
  return { from: addDaysIso(range.from, -length), to: addDaysIso(range.from, -1) }
}

const inRange = (day: string | null, r: DateRange) => !!day && day >= r.from && day <= r.to

export interface ReturnFilters {
  /** "" = every channel. */
  channel: string
  /** "" = every origin; otherwise the sheet's "ที่มา" text. Lines with no origin only show when this is "". */
  origin: string
}

/** Narrow by channel and origin. Cancelled orders have no origin, so they drop out while an origin is picked. */
export function applyFilters(items: TimelineItem[], f: ReturnFilters): TimelineItem[] {
  return items.filter((it) => (!f.channel || it.channel === f.channel) && (!f.origin || it.origin === f.origin))
}

export interface CountAndMoney {
  count: number
  qty: number
  amount: number
}

const emptyTotals = (): CountAndMoney => ({ count: 0, qty: 0, amount: 0 })
function add(t: CountAndMoney, it: TimelineItem) {
  t.count += 1
  t.qty += it.qty
  t.amount += it.amount ?? 0
}

export interface CancelStat {
  /** Orders cancelled in the period. */
  count: number
  /** Of those, still waiting on someone (needs action). */
  open: number
  /** Every such order that is still waiting, whatever its date — right now. */
  openAll: number
}

export interface ReturnSummary {
  range: DateRange
  received: CountAndMoney
  receivedBefore: CountAndMoney
  outstanding: CountAndMoney & { oldestDays: number | null }
  lost: CountAndMoney
  lostBefore: CountAndMoney
  /** none / claimed / unnoted: right now, any date. paid: in the period. */
  money: Record<LostStage, CountAndMoney>
  /** Lost lines that have no date at all, so no period can include them. */
  lostUndated: number
  cancelled: { deducted: CancelStat; notDeducted: CancelStat }
}

/** `ageAt` is the day waiting time is counted to (the calendar day), so a parcel that has waited since August shows its real wait. */
export function summarize(items: TimelineItem[], range: DateRange, ageAt: string | null): ReturnSummary {
  const before = previousRange(range)
  const received = emptyTotals()
  const receivedBefore = emptyTotals()
  const outstanding = { ...emptyTotals(), oldestDays: null as number | null }
  const lost = emptyTotals()
  const lostBefore = emptyTotals()
  const money: Record<LostStage, CountAndMoney> = { none: emptyTotals(), claimed: emptyTotals(), unnoted: emptyTotals(), paid: emptyTotals() }
  let lostUndated = 0
  const cancelled = {
    deducted: { count: 0, open: 0, openAll: 0 } as CancelStat,
    notDeducted: { count: 0, open: 0, openAll: 0 } as CancelStat,
  }

  for (const it of items) {
    if (it.lostStage) {
      if (it.lostStage === "paid") {
        if (inRange(it.date, range)) add(money.paid, it)
      } else add(money[it.lostStage], it)
    }
    if (it.kind === "cancel") {
      const c = it.stockDeducted ? cancelled.deducted : cancelled.notDeducted
      const open = needsAction(it)
      if (open) c.openAll += 1
      if (inRange(it.date, range)) {
        c.count += 1
        if (open) c.open += 1
      }
    } else if (it.kind === "return") {
      if (inRange(it.arrivedOn, range)) add(received, it)
      else if (inRange(it.arrivedOn, before)) add(receivedBefore, it)
      if (it.status.label !== LOST_PAID.label) {
        add(outstanding, it)
        const since = it.date ?? it.arrivedOn
        if (since && ageAt) {
          const age = daysBetweenIso(since, ageAt)
          if (outstanding.oldestDays === null || age > outstanding.oldestDays) outstanding.oldestDays = age
        }
      }
    } else if (it.kind === "lost") {
      if (!it.date) lostUndated += 1
      else if (inRange(it.date, range)) add(lost, it)
      else if (inRange(it.date, before)) add(lostBefore, it)
    }
  }
  return { range, received, receivedBefore, outstanding, lost, lostBefore, money, lostUndated, cancelled }
}

/** Percent change of `now` against `before`; null when there is nothing to compare with. */
export const changeVs = (now: number, before: number): number | null => (before === 0 ? null : ((now - before) / before) * 100)
