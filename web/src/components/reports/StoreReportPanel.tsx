import { useMemo, useState } from "react"
import {
  computeStoreReportTotals,
  distinctStorePeriods,
  distinctStores,
  storeReportForPeriod,
} from "@/lib/store-report-selectors"
import type { StoreReportRow } from "@/api/types"

const ALL_STORES = "__all_stores__"

const money = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`
const num = (n: number) => n.toLocaleString("th-TH")

/** Per-store sales breakdown from the BigSeller Store Report export
 * ("รายงานร้านค้า (BigSeller)"). Independent of the day-range/channel filter
 * above it on the page — this data is pulled by hand at whatever cadence
 * (currently monthly), one period at a time, not daily. */
export function StoreReportPanel({ rows }: { rows: StoreReportRow[] }) {
  const periods = useMemo(() => distinctStorePeriods(rows), [rows])
  const stores = useMemo(() => distinctStores(rows), [rows])
  const [periodIdx, setPeriodIdx] = useState(0)
  const [storeFilter, setStoreFilter] = useState(ALL_STORES)
  const period = periods[periodIdx]

  if (rows.length === 0 || !period) {
    return null
  }

  const periodRowsAll = storeReportForPeriod(rows, period.periodStart, period.periodEnd)
  const periodRows = storeFilter === ALL_STORES ? periodRowsAll : periodRowsAll.filter((r) => r.store === storeFilter)
  const totals = computeStoreReportTotals(periodRows)

  return (
    <div className="glass-panel overflow-x-auto rounded-2xl p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          ช่วง {period.periodStart} – {period.periodEnd} · {periodRows.length} ร้านค้า/ช่องทาง
        </p>
        <div className="flex flex-wrap gap-2">
          {stores.length > 1 && (
            <select
              aria-label="เลือกร้านค้า/ช่องทาง"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm outline-none hover:bg-muted max-sm:min-h-10"
            >
              <option value={ALL_STORES} className="bg-popover text-popover-foreground">
                ทุกร้านค้า/ช่องทาง
              </option>
              {stores.map((s) => (
                <option key={s} value={s} className="bg-popover text-popover-foreground">
                  {s}
                </option>
              ))}
            </select>
          )}
          {periods.length > 1 && (
            <select
              aria-label="เลือกช่วงรายงาน"
              value={periodIdx}
              onChange={(e) => setPeriodIdx(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm outline-none hover:bg-muted max-sm:min-h-10"
            >
              {periods.map((p, i) => (
                <option key={`${p.periodStart}-${p.periodEnd}`} value={i} className="bg-popover text-popover-foreground">
                  {p.periodStart} – {p.periodEnd}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <p className="mb-4 text-2xl font-extrabold tabular-nums text-foreground">
        {money(totals.totalSales)} <span className="text-sm font-semibold text-muted-foreground">ยอดขายรวมของช่วงนี้</span>
      </p>

      <table className="stack-table w-full min-w-[760px] text-left text-base">
        <thead>
          <tr className="border-b border-border text-sm text-muted-foreground">
            <th className="pb-2.5 font-medium">ร้านค้า/ช่องทาง</th>
            <th className="pb-2.5 text-right font-medium">ยอดขาย (฿)</th>
            <th className="pb-2.5 text-right font-medium">ยอดขายมีผล (฿)</th>
            <th className="pb-2.5 text-right font-medium">คำสั่งซื้อ</th>
            <th className="pb-2.5 text-right font-medium">ยกเลิก</th>
            <th className="pb-2.5 text-right font-medium">ยอดขายสินค้า (฿)</th>
            <th className="pb-2.5 text-right font-medium">คืนสินค้า (฿)</th>
          </tr>
        </thead>
        <tbody>
          {periodRows.map((r) => (
            <tr key={r.store} className="border-b border-white/5 last:border-0">
              <td className="stack-title py-2.5 pr-3 text-foreground">
                <span className="block font-semibold">{r.store}</span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="block h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${totals.totalSales > 0 ? Math.max(0, Math.min(100, (r.sales / totals.totalSales) * 100)) : 0}%` }} />
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{totals.totalSales > 0 ? ((r.sales / totals.totalSales) * 100).toFixed(1) : "0.0"}%</span>
                </span>
              </td>
              <td data-label="ยอดขาย (฿)" className="py-2.5 text-right tabular-nums font-medium">{money(r.sales)}</td>
              <td data-label="ยอดขายมีผล (฿)" className="py-2.5 text-right tabular-nums text-muted-foreground">{money(r.effSales)}</td>
              <td data-label="คำสั่งซื้อ" className="py-2.5 text-right tabular-nums">{num(r.totalOrders)}</td>
              <td data-label="ยกเลิก" className="py-2.5 text-right tabular-nums text-destructive">{num(r.cancelledOrders)}</td>
              <td data-label="ยอดขายสินค้า (฿)" className="py-2.5 text-right tabular-nums">{money(r.productSales)}</td>
              <td data-label="คืนสินค้า (฿)" className="py-2.5 text-right tabular-nums text-destructive">
                {money(r.refundAmount)}
                {r.refundOrders > 0 && <span className="ml-1 text-muted-foreground">({num(r.refundOrders)})</span>}
              </td>
            </tr>
          ))}
          {periodRows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-muted-foreground">
                ไม่มีข้อมูลร้านค้านี้ในช่วงที่เลือก
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-border text-sm font-semibold text-foreground">
            <td className="stack-title pt-2.5">รวม</td>
            <td data-label="ยอดขาย (฿)" className="pt-2.5 text-right tabular-nums">{money(totals.totalSales)}</td>
            <td data-label="ยอดขายมีผล (฿)" className="pt-2.5 text-right tabular-nums text-muted-foreground">{money(totals.totalEffSales)}</td>
            <td data-label="คำสั่งซื้อ" className="pt-2.5 text-right tabular-nums">{num(totals.totalOrders)}</td>
            <td data-label="ยกเลิก" className="pt-2.5 text-right tabular-nums text-destructive">{num(totals.totalCancelledOrders)}</td>
            <td data-label="ยอดขายสินค้า (฿)" className="pt-2.5 text-right tabular-nums">{money(totals.totalProductSales)}</td>
            <td data-label="คืนสินค้า (฿)" className="pt-2.5 text-right tabular-nums text-destructive">
              {money(totals.totalRefundAmount)}
              {totals.totalRefundOrders > 0 && <span className="ml-1 text-muted-foreground">({num(totals.totalRefundOrders)})</span>}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        ที่มาข้อมูล: ชีต "รายงานร้านค้า (BigSeller)" (BigSeller Store Report export) · ดึงเป็นรายเดือน ไม่ใช่รายวัน — ตัวเลขคือยอดรวมทั้งช่วงที่เลือก ไม่ใช่ยอดต่อวัน
      </p>
    </div>
  )
}
