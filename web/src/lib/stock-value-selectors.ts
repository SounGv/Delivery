import type { StockValueRow } from "@/api/types"

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

/** Highest value first, so the SKUs worth the most sit at the top of the table by default. */
export function sortByValueDesc(rows: StockValueRow[]): StockValueRow[] {
  return [...rows].sort((a, b) => b.stockValue - a.stockValue)
}
