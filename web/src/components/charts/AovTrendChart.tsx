import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { OrderReportDay } from "@/api/types"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"
import { formatFullDateLabel } from "@/lib/format"

/** Daily average order value, with a dashed line marking the period average
 * so it's obvious at a glance which days ran above/below normal. */
export function AovTrendChart({ days }: { days: OrderReportDay[] }) {
  const { theme } = useTheme()

  const avgAov = useMemo(() => {
    if (days.length === 0) return 0
    return days.reduce((sum, d) => sum + d.aov, 0) / days.length
  }, [days])

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
        axisLabel: { color: t.muted, formatter: (v: number) => `฿${v.toLocaleString("th-TH")}` },
      },
      series: [
        {
          name: "AOV",
          type: "line",
          smooth: true,
          symbol: "none",
          areaStyle: { opacity: 0.12 },
          data: days.map((d) => d.aov),
          itemStyle: { color: "#8b5cf6" },
          lineStyle: { width: 2.5 },
          markLine: {
            symbol: "none",
            silent: true,
            label: { formatter: "เฉลี่ย", color: t.muted },
            lineStyle: { type: "dashed", color: t.muted },
            data: [{ yAxis: avgAov }],
          },
        },
      ],
    }
  }, [days, avgAov, theme])

  return (
    <ChartCard
      title="AOV รายวัน (มูลค่าเฉลี่ยต่อออเดอร์)"
      subtitle={`เฉลี่ยทั้งช่วง ฿${avgAov.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`}
    >
      <EChart option={option} height={300} />
    </ChartCard>
  )
}
