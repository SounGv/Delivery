import type { RestockRow } from "@/api/types"

/** The Stock-In statuses the sheet's own summary ("สรุป-cn-restock") lists, in its order. */
export const RESTOCK_STOCK_IN_STATUSES = ["ยังไม่ Stock-In", "Stock-In บางส่วน", "ไม่ Stock-In"]

export interface RestockTotals {
  /** Distinct หมายเลขคำสั่งซื้อ — the sheet counts orders this way. */
  orders: number
  /** One row per SKU, as in the sheet. */
  rows: number
  qty: number
  refundAmount: number
}

export function totalsOf(rows: RestockRow[]): RestockTotals {
  const orders = new Set<string>()
  let qty = 0
  let refundAmount = 0
  for (const r of rows) {
    if (r.orderNo) orders.add(r.orderNo)
    qty += r.qty
    refundAmount += r.refundAmount
  }
  return { orders: orders.size, rows: rows.length, qty, refundAmount }
}

/** Totals per Stock-In status, mirroring the sheet's "สรุปตามสถานะ Stock-In" table. */
export function totalsByStockIn(rows: RestockRow[]): Map<string, RestockTotals> {
  const groups = new Map<string, RestockRow[]>()
  for (const r of rows) {
    const key = r.stockInStatus || "ไม่ระบุ"
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  const out = new Map<string, RestockTotals>()
  for (const [key, list] of groups) out.set(key, totalsOf(list))
  return out
}

/** True when the team's free-typed "หมายเหตุ Stock-In" says the refund was received
 * ("ได้เงินแล้ว", "ได้เงินคืนแล้ว", "ได้รับเงินคืนแล้ว / 219", including the typo
 * "ไ้ดรับเงินคืนแล้ว" seen in the sheet). It is a text match on a hand-typed note, not a
 * status column, so treat the count as "the note says so". */
export function isRefundNoted(row: RestockRow): boolean {
  return /ได้เงิน|ได้รับเงิน|ไ้ดรับเงิน/.test(row.stockInNote)
}

/** Oldest request first (it has waited longest); lines with no request time go last. */
export function sortByRequestedAt(rows: RestockRow[]): RestockRow[] {
  return [...rows].sort((a, b) => {
    if (!a.requestedAt && !b.requestedAt) return 0
    if (!a.requestedAt) return 1
    if (!b.requestedAt) return -1
    return a.requestedAt < b.requestedAt ? -1 : a.requestedAt > b.requestedAt ? 1 : 0
  })
}

export function distinctRestockTexts(rows: RestockRow[], pick: (row: RestockRow) => string): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const value = pick(r)
    if (value) set.add(value)
  }
  return [...set].sort()
}
