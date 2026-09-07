import { useMemo } from "react"
import { ChartCard } from "./ChartCard"
import { BarLineChart } from "./BarLineChart"
import type { OrderReportDay } from "@/api/types"
import { monthlySalesTrend } from "@/lib/order-report-selectors"
import { formatMonthLabel } from "@/lib/format"

/** Compares ยอดขาย/คำสั่งซื้อ/พัสดุ month over month for the current channel
 * filter and date range — orders and parcels as bars (left axis, same count
 * scale), sales as the trend line (right axis, money scale). */
export function MonthlyTrendChart({ days }: { days: OrderReportDay[] }) {
  const rows = useMemo(() => monthlySalesTrend(days), [days])

  return (
    <ChartCard title="เทียบยอดขาย/คำสั่งซื้อ/พัสดุ รายเดือน" subtitle="แนวโน้มแต่ละเดือน ตามช่องทางและช่วงวันที่ที่เลือกด้านบน">
      <BarLineChart
        categories={rows.map((r) => formatMonthLabel(r.monthKey))}
        bars={[
          { name: "คำสั่งซื้อ", data: rows.map((r) => r.orders) },
          { name: "พัสดุ", data: rows.map((r) => r.parcels) },
        ]}
        line={{ name: "ยอดขาย", data: rows.map((r) => r.sales) }}
        leftAxisFormatter={(v) => v.toLocaleString("th-TH")}
        rightAxisFormatter={(v) => `${(v / 1e6).toFixed(1)}M`}
        height={320}
      />
    </ChartCard>
  )
}
