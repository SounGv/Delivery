import type { ReturnRow } from "@/api/types"

export function distinctPlatforms(rows: ReturnRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) if (r.platform) set.add(r.platform)
  return [...set].sort()
}

export function distinctStores(rows: ReturnRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) if (r.store) set.add(r.store)
  return [...set].sort((a, b) => a.localeCompare(b, "th"))
}

/** Case is still "not back in the warehouse yet" — the sheet's own "ธง" flag
 * already encodes this ("🟢 ยังไม่รับสินค้า" / "🔵 รอ Stock-In ..."), checked by
 * substring since the flag always carries a leading emoji. */
export function isInTransit(row: ReturnRow): boolean {
  return row.flag.indexOf("ยังไม่รับสินค้า") !== -1 || row.flag.indexOf("รอ Stock-In") !== -1
}

/** Shopee scanned the item back into stock but the platform is still showing a
 * refund button to press — see ReturnRow.refundButtonPending's doc (Shopee-only). */
export function isPendingRefundButton(row: ReturnRow): boolean {
  return row.refundButtonPending === "มี"
}

/** Due within 2 days and not already resolved. Mirrors the sheet's own
 * "🔴 เร่งด่วน ≤2 วัน" flag rather than recomputing the threshold, so this never
 * drifts from what staff see in the source sheet. */
export function isUrgent(row: ReturnRow): boolean {
  return row.flag.indexOf("เร่งด่วน") !== -1
}

/** The sheet's own "สถานะการคืนสินค้า" marks the parcel lost in transit — never
 * came back, so it will never reach Stock-In no matter how long it waits. */
export function isLost(row: ReturnRow): boolean {
  return row.returnStatus === "สูญหาย"
}

/** Required-return quantity doesn't match what was actually scanned into stock
 * — either the item never arrived, or more arrived than was asked for. Zero
 * when either side is zero AND the other is too (nothing to reconcile yet). */
export function hasQtyDiscrepancy(row: ReturnRow): boolean {
  if (row.qtyToReturn === 0 && row.qtyStockedIn === 0) return false
  return row.qtyToReturn !== row.qtyStockedIn
}

export interface ReturnsTotals {
  count: number
  pendingRefundButtonCount: number
  inTransitCount: number
  urgentCount: number
  lostCount: number
  discrepancyCount: number
  totalRefundAmount: number
}

export function computeReturnsTotals(rows: ReturnRow[]): ReturnsTotals {
  return rows.reduce<ReturnsTotals>(
    (acc, r) => ({
      count: acc.count + 1,
      pendingRefundButtonCount: acc.pendingRefundButtonCount + (isPendingRefundButton(r) ? 1 : 0),
      inTransitCount: acc.inTransitCount + (isInTransit(r) ? 1 : 0),
      urgentCount: acc.urgentCount + (isUrgent(r) ? 1 : 0),
      lostCount: acc.lostCount + (isLost(r) ? 1 : 0),
      discrepancyCount: acc.discrepancyCount + (hasQtyDiscrepancy(r) ? 1 : 0),
      totalRefundAmount: acc.totalRefundAmount + r.refundAmount,
    }),
    { count: 0, pendingRefundButtonCount: 0, inTransitCount: 0, urgentCount: 0, lostCount: 0, discrepancyCount: 0, totalRefundAmount: 0 }
  )
}

export interface PlatformBreakdownRow {
  platform: string
  count: number
  refundAmount: number
}

export function breakdownByPlatform(rows: ReturnRow[]): PlatformBreakdownRow[] {
  const map = new Map<string, PlatformBreakdownRow>()
  for (const r of rows) {
    const key = r.platform || "ไม่ระบุ"
    const entry = map.get(key) ?? { platform: key, count: 0, refundAmount: 0 }
    entry.count += 1
    entry.refundAmount += r.refundAmount
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export interface ReasonBreakdownRow {
  reason: string
  count: number
}

/** Only rows with a real "สาเหตุ" code (currently populated for Shopee requests
 * only) count here — blank reasons (cancellations, non-Shopee platforms) are
 * left out rather than shown as a misleading "ไม่ระบุ" majority slice.
 * BigSeller mixes platform reason CODES with free-typed Thai reasons across
 * dozens of distinct values, so this keeps only the top `limit` and lumps
 * everything else into "อื่นๆ" — a ranked breakdown reads as one screen's
 * worth of bars, not a scroll of fifty single-digit rows. */
export function breakdownByReason(rows: ReturnRow[], limit = 8): ReasonBreakdownRow[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.reason) continue
    map.set(r.reason, (map.get(r.reason) ?? 0) + 1)
  }
  const ranked = [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
  if (ranked.length <= limit) return ranked
  const head = ranked.slice(0, limit)
  const otherCount = ranked.slice(limit).reduce((sum, r) => sum + r.count, 0)
  return [...head, { reason: "อื่นๆ", count: otherCount }]
}
