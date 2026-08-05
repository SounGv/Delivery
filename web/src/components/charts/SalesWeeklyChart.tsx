import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { OrderReportDay } from "@/api/types"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"
import { weeklySalesBuckets } from "@/lib/order-report-selectors"

/** Total effective-order sales per consecutive 7-day window across the whole data range. */
export function SalesWeeklyChart({ days }: { days: OrderReportDay[] }) {
  const { theme } = useTheme()

  const weeks = useMemo(() => weeklySalesBuckets(days), [days])

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    return {
      textStyle: { color: t.muted },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const p = (params as Array<{ dataIndex: number; value: number; marker: string }>)[0]
          const w = p ? weeks[p.dataIndex] : undefined
          if (!p || !w) return ""
          const partial = w.dayCount < 7 ? ` (ข้อมูล ${w.dayCount} วัน)` : ""
          return `${w.label}<br/>${p.marker}ยอดขาย: ฿${p.value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}${partial}`
        },
      },
      grid: { left: 8, right: 16, top: 24, bottom: 28, containLabel: true },
      xAxis: {
        type: "category",
        data: weeks.map((w) => w.label),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted, formatter: (v: number) => `${(v / 1e6).toFixed(0)}M` },
      },
      series: [
        {
          name: "ยอดขายรายสัปดาห์",
          type: "bar",
          data: weeks.map((w) => w.sales),
          itemStyle: { color: t.brand, borderRadius: [6, 6, 0, 0] },
          barMaxWidth: 46,
        },
      ],
    }
  }, [weeks, theme])

  return (
    <ChartCard title="ยอดขายรวมรายสัปดาห์" subtitle="แบ่งเป็นช่วง 7 วันต่อเนื่องจากวันแรกของข้อมูล">
      <EChart option={option} height={300} />
    </ChartCard>
  )
}
