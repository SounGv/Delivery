import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { OrderReportDay } from "@/api/types"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"
import { peakDay } from "@/lib/order-report-selectors"
import { formatFullDateLabel } from "@/lib/format"

/** Daily effective-order sales trend, with the single highest-selling day marked. */
export function SalesTrendChart({ days }: { days: OrderReportDay[] }) {
  const { theme } = useTheme()

  const peak = useMemo(() => peakDay(days), [days])

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    return {
      textStyle: { color: t.muted },
      tooltip: {
        trigger: "axis",
        valueFormatter: (v) => `฿${Number(v).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`,
      },
      grid: { left: 8, right: 16, top: 24, bottom: 28, containLabel: true },
      xAxis: {
        type: "category",
        data: days.map((d) => formatFullDateLabel(d.date)),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted, formatter: (v: number) => `${(v / 1e6).toFixed(1)}M` },
      },
      series: [
        {
          name: "ยอดขาย",
          type: "line",
          smooth: true,
          symbol: "none",
          areaStyle: { opacity: 0.12 },
          data: days.map((d) => d.effSales),
          itemStyle: { color: t.brand },
          lineStyle: { width: 2.5 },
          markPoint: peak
            ? {
                data: [{ name: "จุดสูงสุด", coord: [days.indexOf(peak), peak.effSales] }],
                itemStyle: { color: t.amber },
                label: { color: "#fff", fontSize: 10 },
              }
            : undefined,
        },
      ],
    }
  }, [days, peak, theme])

  return (
    <ChartCard
      title="แนวโน้มยอดขายรายวัน"
      subtitle={peak ? `จุดสูงสุด: ${formatFullDateLabel(peak.date)} (฿${peak.effSales.toLocaleString("th-TH", { maximumFractionDigits: 0 })})` : undefined}
    >
      <EChart option={option} height={320} />
    </ChartCard>
  )
}
