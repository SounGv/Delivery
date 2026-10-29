import type { CancelledRow, CancelledStatus } from "@/api/types"

export const CANCELLED_STATUSES: CancelledStatus[] = ["รอตรวจสอบ", "รับแล้ว", "ไม่ตรง"]

/** A line still "รอตรวจสอบ" after this many days is flagged — the parcel should
 * have been scanned back in by then. Placeholder default, adjustable in the page. */
export const DEFAULT_STALE_DAYS = 3

const DAY_MS = 86_400_000

/** Whole days from `dateIso` (yyyy-MM-dd) to `todayIso`; 0 when either is unparseable. */
export function daysBetween(dateIso: string, todayIso: string): number {
  const a = Date.parse(`${dateIso}T00:00:00Z`)
  const b = Date.parse(`${todayIso}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / DAY_MS))
}

/** Still waiting for the warehouse scan and older than `staleDays`. */
export function isStaleCancelled(row: CancelledRow, todayIso: string, staleDays: number): boolean {
  return row.status === "รอตรวจสอบ" && daysBetween(row.date, todayIso) > staleDays
}

export function distinctChannels(rows: CancelledRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) if (r.channel) set.add(r.channel)
  return [...set].sort()
}

export interface CancelledTotals {
  lines: number
  orders: number
  qty: number
  pending: number
  received: number
  mismatch: number
  stale: number
}

export function computeCancelledTotals(rows: CancelledRow[], todayIso: string, staleDays: number): CancelledTotals {
  const orders = new Set<string>()
  const totals: CancelledTotals = { lines: 0, orders: 0, qty: 0, pending: 0, received: 0, mismatch: 0, stale: 0 }
  for (const r of rows) {
    totals.lines += 1
    totals.qty += r.qty
    if (r.orderNo) orders.add(r.orderNo)
    if (r.status === "รอตรวจสอบ") totals.pending += 1
    else if (r.status === "รับแล้ว") totals.received += 1
    else totals.mismatch += 1
    if (isStaleCancelled(r, todayIso, staleDays)) totals.stale += 1
  }
  totals.orders = orders.size
  return totals
}

export interface ChannelBreakdownRow {
  channel: string
  lines: number
  qty: number
  pending: number
}

export function breakdownByChannel(rows: CancelledRow[]): ChannelBreakdownRow[] {
  const map = new Map<string, ChannelBreakdownRow>()
  for (const r of rows) {
    const key = r.channel || "ไม่ระบุ"
    const entry = map.get(key) ?? { channel: key, lines: 0, qty: 0, pending: 0 }
    entry.lines += 1
    entry.qty += r.qty
    if (r.status === "รอตรวจสอบ") entry.pending += 1
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => b.lines - a.lines)
}

export interface PickerBreakdownRow {
  picker: string
  lines: number
  qty: number
}

/** Who received the parcels back — only lines that already have a name. */
export function breakdownByPicker(rows: CancelledRow[]): PickerBreakdownRow[] {
  const map = new Map<string, PickerBreakdownRow>()
  for (const r of rows) {
    if (!r.picker) continue
    const entry = map.get(r.picker) ?? { picker: r.picker, lines: 0, qty: 0 }
    entry.lines += 1
    entry.qty += r.qty
    map.set(r.picker, entry)
  }
  return [...map.values()].sort((a, b) => b.lines - a.lines)
}

export interface DailyCancelled {
  date: string
  byChannel: Record<string, number>
}

/** Lines per day per channel, oldest day first (days with no rows are omitted). */
export function breakdownByDay(rows: CancelledRow[]): DailyCancelled[] {
  const map = new Map<string, DailyCancelled>()
  for (const r of rows) {
    const entry = map.get(r.date) ?? { date: r.date, byChannel: {} }
    const key = r.channel || "ไม่ระบุ"
    entry.byChannel[key] = (entry.byChannel[key] ?? 0) + 1
    map.set(r.date, entry)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}
