import type { RefundCase, RestockRow } from "@/api/types"

const PAID_TEXT = "ได้เงินคืนแล้ว"

/** The sheet's own verdict: "ผลเคส" says "ได้เงินคืนแล้ว" once the money is back; any other
 * value ("รอเงินคืนจากขนส่ง") means it has not come back yet. */
export function isRefundPaid(row: RefundCase): boolean {
  return row.caseResult.includes(PAID_TEXT)
}

/**
 * Carrier name read off the return tracking number. The sheets carry no carrier name, so
 * this is a rule, not data: measured on 1,081 return cases that did have a carrier name from
 * BigSeller (2026-11-06), the prefix decided it every time — JTTH (325/325) J&T Express,
 * THT (308/308) Flash Express, TH+digits (398/398, two spellings of SPX) SPX Express,
 * TIK (23/23) KEX Express, WC (2/2) Thailand Post. Any other prefix (SDOFRT…, LEXCRP…) had
 * no name to learn from, so it stays blank rather than guessed.
 */
export function carrierFromTracking(tracking: string): string {
  const t = tracking.trim().toUpperCase()
  if (!t) return ""
  if (t.startsWith("JTTH")) return "J&T Express"
  if (t.startsWith("THT")) return "Flash Express"
  if (t.startsWith("SPXTH") || /^TH\d/.test(t)) return "SPX Express"
  if (t.startsWith("TIK")) return "KEX Express"
  if (t.startsWith("WC")) return "ไปรษณีย์ไทย"
  return ""
}

/** BigSeller package number -> return tracking number, from the cn-restock lines (the only
 * tab that carries "หมายเลขแทร็คกิ้งคืนสินค้า"). A package can span several SKU lines; they
 * share one tracking number. */
export function trackingByPackage(rows: RestockRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of rows) {
    if (r.packageNo && r.returnTracking && !map.has(r.packageNo)) map.set(r.packageNo, r.returnTracking)
  }
  return map
}

export interface RefundTotals {
  orders: number
  rows: number
  qty: number
  sellPrice: number
  refunded: number
}

export function refundTotalsOf(rows: RefundCase[]): RefundTotals {
  const orders = new Set<string>()
  const totals: RefundTotals = { orders: 0, rows: rows.length, qty: 0, sellPrice: 0, refunded: 0 }
  for (const r of rows) {
    if (r.orderNo) orders.add(r.orderNo)
    totals.qty += r.qty
    totals.sellPrice += r.sellPrice ?? 0
    totals.refunded += r.refunded ?? 0
  }
  totals.orders = orders.size
  return totals
}

/** Cases still waiting for money first (they need chasing), then the closed ones. */
export function sortRefundCases(rows: RefundCase[]): RefundCase[] {
  return [...rows].sort((a, b) => Number(isRefundPaid(a)) - Number(isRefundPaid(b)))
}

export function distinctRefundTexts(rows: RefundCase[], pick: (row: RefundCase) => string): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const value = pick(r)
    if (value) set.add(value)
  }
  return [...set].sort()
}
