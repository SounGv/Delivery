import { useMemo, useState } from "react"
import { Store } from "lucide-react"
import {
  computeStoreReportTotals,
  distinctStorePeriods,
  storeReportForPeriod,
} from "@/lib/store-report-selectors"
import type { StoreReportRow } from "@/api/types"

const money = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`
const num = (n: number) => n.toLocaleString("th-TH")

/** Per-store sales breakdown from the BigSeller Store Report export
 * ("รายงานร้านค้า (BigSeller)"). Independent of the day-range/channel filter
 * above it on the page — this data is pulled by hand at whatever cadence
 * (currently monthly), one period at a time, not daily. */
export function StoreReportPanel({ rows }: { rows: StoreReportRow[] }) {
  const periods = useMemo(() => distinctStorePeriods(rows), [rows])
  const [periodIdx, setPeriodIdx] = useState(0)
  const period = periods[periodIdx]

  if (rows.length === 0 || !period) {
    return null
  }

  const periodRows = storeReportForPeriod(rows, period.periodStart, period.periodEnd)
  const totals = computeStoreReportTotals(periodRows)

  return (
    <div className="glass-panel overflow-x-auto rounded-2xl p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Store className="size-5" /> ยอดขายแยกร้านค้า/ช่องทาง
        </h3>
        {periods.length > 1 && (
          <select
            value={periodIdx}
            onChange={(e) => setPeriodIdx(Number(e.target.value))}
            className="rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm font-medium text-foreground outline-none"
          >
            {periods.map((p, i) => (
              <option key={`${p.periodStart}-${p.periodEnd}`} value={i} className="bg-popover text-popover-foreground">
                {p.periodStart} – {p.periodEnd}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        ช่วง {period.periodStart} – {period.periodEnd} · รวม {periodRows.length} ร้านค้า/ช่องทาง · ยอดขายรวม {money(totals.totalSales)}
      </p>

      <table className="w-full min-w-[640px] text-left text-base">
        <thead>
          <tr className="border-b border-border text-sm text-muted-foreground">
            <th className="pb-2.5 font-medium">ร้านค้า/ช่องทาง</th>
            <th className="pb-2.5 text-right font-medium">ยอดขาย (฿)</th>
            <th className="pb-2.5 text-right font-medium">ยอดขายมีผล (฿)</th>
            <th className="pb-2.5 text-right font-medium">คำสั่งซื้อ</th>
            <th className="pb-2.5 text-right font-medium">พัสดุ</th>
            <th className="pb-2.5 text-right font-medium">ยอดขายสินค้า (฿)</th>
          </tr>
        </thead>
        <tbody>
          {periodRows.map((r) => (
            <tr key={r.store} className="border-b border-white/5 last:border-0">
              <td className="py-2.5 text-foreground">{r.store}</td>
              <td className="py-2.5 text-right tabular-nums font-medium">{money(r.sales)}</td>
              <td className="py-2.5 text-right tabular-nums text-muted-foreground">{money(r.effSales)}</td>
              <td className="py-2.5 text-right tabular-nums">{num(r.totalOrders)}</td>
              <td className="py-2.5 text-right tabular-nums">{num(r.parcels)}</td>
              <td className="py-2.5 text-right tabular-nums">{money(r.productSales)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border text-sm font-semibold text-foreground">
            <td className="pt-2.5">รวม</td>
            <td className="pt-2.5 text-right tabular-nums">{money(totals.totalSales)}</td>
            <td className="pt-2.5 text-right tabular-nums text-muted-foreground">{money(totals.totalEffSales)}</td>
            <td className="pt-2.5 text-right tabular-nums">{num(totals.totalOrders)}</td>
            <td className="pt-2.5 text-right tabular-nums">{num(totals.totalParcels)}</td>
            <td className="pt-2.5 text-right tabular-nums">{money(totals.totalProductSales)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        ที่มาข้อมูล: ชีต "รายงานร้านค้า (BigSeller)" (BigSeller Store Report export) · ดึงเป็นรายเดือน ไม่ใช่รายวัน — ตัวเลขคือยอดรวมทั้งช่วงที่เลือก ไม่ใช่ยอดต่อวัน
      </p>
    </div>
  )
}
