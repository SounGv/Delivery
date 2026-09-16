import type { StoreReportRow } from "@/api/types"

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
    .filter((r) => r.periodStart === periodStart && r.periodEnd === periodEnd)
    .slice()
    .sort((a, b) => b.sales - a.sales)
}

export interface StoreReportTotals {
  totalSales: number
  totalEffSales: number
  totalOrders: number
  totalParcels: number
  totalCustomers: number
}

export function computeStoreReportTotals(rows: StoreReportRow[]): StoreReportTotals {
  return rows.reduce(
    (acc, r) => ({
      totalSales: acc.totalSales + r.sales,
      totalEffSales: acc.totalEffSales + r.effSales,
      totalOrders: acc.totalOrders + r.totalOrders,
      totalParcels: acc.totalParcels + r.parcels,
      totalCustomers: acc.totalCustomers + r.customers,
    }),
    { totalSales: 0, totalEffSales: 0, totalOrders: 0, totalParcels: 0, totalCustomers: 0 }
  )
}
