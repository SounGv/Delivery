import type { StockValueReport, StockValueRow } from "@/api/types"

export const ALL_WAREHOUSES = "__all__"

export function distinctWarehouses(rows: StockValueRow[]): string[] {
  return [...new Set(rows.map((r) => r.warehouse).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"))
}

export function filterStockValueRows(rows: StockValueRow[], warehouse: string, query: string): StockValueRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => {
    if (warehouse !== ALL_WAREHOUSES && r.warehouse !== warehouse) return false
    if (q && !r.sku.toLowerCase().includes(q)) return false
    return true
  })
}

/** A warehouse whose web value differs from BigSeller's own figure by at least this much is flagged. */
export const STOCK_DIFF_WARN_PERCENT = 25
/** BigSeller figures older than this many days are flagged as stale (they only refresh when someone runs the sync). */
export const STOCK_REFERENCE_STALE_DAYS = 7

export interface StockWarehouseSummary {
  warehouse: string
  value: number
  /** Share of the all-warehouse total, 0-100. */
  share: number
  /** Web value vs BigSeller on-hand cost, in percent; null when BigSeller has no figure (or 0) to compare with. */
  diffPercent: number | null
  highDiff: boolean
}

export interface StockSnapshot {
  total: number
  warehouses: StockWarehouseSummary[]
  inTransitCost: number
  inTransitUnits: number
  inTransitWarehouses: number
  /** ISO time of the BigSeller export, "" when the reference tab is empty. */
  asOf: string
  /** Whole days between asOf and today; null when asOf is unknown. */
  ageDays: number | null
  highDiffCount: number
}

/** Numbers the overview page shows about stock, derived from the same payload the stock-value page reads. */
export function summarizeStockValue(report: StockValueReport, todayMs: number): StockSnapshot {
  const reference = report.reference ?? []
  const total = report.byWarehouse.reduce((sum, w) => sum + w.totalValue, 0)
  const warehouses = [...report.byWarehouse]
    .sort((a, b) => b.totalValue - a.totalValue)
    .map((w): StockWarehouseSummary => {
      const ref = reference.find((r) => r.warehouse === w.warehouse)
      const diffPercent = ref && ref.bigsellerOnHandCost > 0 ? ((w.totalValue - ref.bigsellerOnHandCost) / ref.bigsellerOnHandCost) * 100 : null
      return {
        warehouse: w.warehouse,
        value: w.totalValue,
        share: total > 0 ? (w.totalValue / total) * 100 : 0,
        diffPercent,
        highDiff: diffPercent !== null && Math.abs(diffPercent) >= STOCK_DIFF_WARN_PERCENT,
      }
    })
  const inTransit = reference.filter((r) => r.inTransitUnits > 0)
  const asOf = reference[0]?.sourceUpdatedAt ?? ""
  const asOfMs = asOf ? Date.parse(asOf) : NaN
  return {
    total,
    warehouses,
    inTransitCost: inTransit.reduce((sum, r) => sum + r.bigsellerInTransitCost, 0),
    inTransitUnits: inTransit.reduce((sum, r) => sum + r.inTransitUnits, 0),
    inTransitWarehouses: inTransit.length,
    asOf,
    ageDays: Number.isNaN(asOfMs) ? null : Math.max(0, Math.floor((todayMs - asOfMs) / 86_400_000)),
    highDiffCount: warehouses.filter((w) => w.highDiff).length,
  }
}

/** Highest value first, so the SKUs worth the most sit at the top of the table by default. */
export function sortByValueDesc(rows: StockValueRow[]): StockValueRow[] {
  return [...rows].sort((a, b) => b.stockValue - a.stockValue)
}
