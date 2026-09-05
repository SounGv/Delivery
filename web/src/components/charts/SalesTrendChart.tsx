import { useMemo } from "react"
import { ChartCard } from "./ChartCard"
import { BarLineChart } from "./BarLineChart"
import type { OrderReportDay } from "@/api/types"
import { peakDay } from "@/lib/order-report-selectors"
import { formatFullDateLabel } from "@/lib/format"

/** Daily sales trend, BigSeller-style: order-count bars on the left axis, sales
 * value as the trend line on the right axis. Same `{ days }` prop as before —
 * no call-site changes needed in SalesSummary.tsx. */
export function SalesTrendChart({ days }: { days: OrderReportDay[] }) {
  const peak = useMemo(() => peakDay(days), [days])

  return (
    <ChartCard
      title="แนวโน้มยอดขายรายวัน"
      subtitle={peak ? `จุดสูงสุด: ${formatFullDateLabel(peak.date)} (฿${peak.effSales.toLocaleString("th-TH", { maximumFractionDigits: 0 })})` : undefined}
    >
      <BarLineChart
        categories={days.map((d) => formatFullDateLabel(d.date))}
        bars={[{ name: "คำสั่งซื้อ", data: days.map((d) => d.effOrders) }]}
        line={{ name: "ยอดขาย", data: days.map((d) => d.effSales) }}
        leftAxisFormatter={(v) => v.toLocaleString("th-TH")}
        rightAxisFormatter={(v) => `${(v / 1e6).toFixed(1)}M`}
        height={320}
      />
    </ChartCard>
  )
}
