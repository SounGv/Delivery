import type { StoreReportRow } from "@/api/types"

/** Not real storefronts — internal/adjustment rows BigSeller's own Store
 * Report lumps in alongside actual stores. Excluded from every view here
 * (not deleted from the sheet, which stays a faithful export snapshot).
 * "LockStock" is a stock-lock/adjustment bucket, not a sales channel.
 * "สินค้าเคลม (GV)" is warranty-claim replacements, not new sales.
 * "Marketing" is marketing-sample/giveaway orders, not paid sales. */
const EXCLUDED_STORES = new Set(["LockStock", "สินค้าเคลม (GV)", "Marketing"])

/** Every distinct period present in the sheet, newest-pulled first (matches
 * insertion order: each pull is prepended as a new block of rows). */
export function distinctStorePeriods(rows: StoreReportRow[]): { periodStart: string; periodEnd: string }[] {
  const seen = new Set<string>()
  const periods: { periodStart: string; periodEnd: string }[] = []
  for (const row of rows) {
    const key = `${row.periodStart}|${row.periodEnd}`
    if (seen.has(key)) continue
    seen.add(key)
    periods.push({ periodStart: row.periodStart, periodEnd: row.periodEnd })
  }
  return periods
}

/** Rows for one period, sorted by ยอดขาย (sales) descending — highest-selling
 * store first, matching how the BigSeller Store Report page itself reads. */
export function storeReportForPeriod(rows: StoreReportRow[], periodStart: string, periodEnd: string): StoreReportRow[] {
  return rows
    .filter((r) => r.periodStart === periodStart && r.periodEnd === periodEnd && !EXCLUDED_STORES.has(r.store))
    .slice()
    .sort((a, b) => b.sales - a.sales)
}

/** Every real store name present across all periods (excludes the non-store
 * adjustment rows), sorted alphabetically for a stable dropdown order. */
export function distinctStores(rows: StoreReportRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) if (!EXCLUDED_STORES.has(r.store)) set.add(r.store)
  return [...set].sort((a, b) => a.localeCompare(b, "th"))
}

export interface StoreReportTotals {
  totalSales: number
  totalEffSales: number
  totalOrders: number
  totalCancelledOrders: number
  totalProductSales: number
  totalRefundAmount: number
  totalRefundOrders: number
}

export function computeStoreReportTotals(rows: StoreReportRow[]): StoreReportTotals {
  return rows.reduce(
    (acc, r) => ({
      totalSales: acc.totalSales + r.sales,
      totalEffSales: acc.totalEffSales + r.effSales,
      totalOrders: acc.totalOrders + r.totalOrders,
      totalCancelledOrders: acc.totalCancelledOrders + r.cancelledOrders,
      totalProductSales: acc.totalProductSales + r.productSales,
      totalRefundAmount: acc.totalRefundAmount + r.refundAmount,
      totalRefundOrders: acc.totalRefundOrders + r.refundOrders,
    }),
    { totalSales: 0, totalEffSales: 0, totalOrders: 0, totalCancelledOrders: 0, totalProductSales: 0, totalRefundAmount: 0, totalRefundOrders: 0 }
  )
}
