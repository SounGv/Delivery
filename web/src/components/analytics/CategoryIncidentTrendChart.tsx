import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import type { MonthlyCategoryTrend } from "@/lib/dashboard-selectors"
import { formatMonthLabel } from "@/lib/format"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#f87171"]

export function CategoryIncidentTrendChart({ trend }: { trend: MonthlyCategoryTrend }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()

    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { type: "scroll", top: 0, textStyle: { color: t.muted }, data: trend.categories.map((c) => c.title) },
      grid: { left: 8, right: 8, top: 40, bottom: 28, containLabel: true },
      xAxis: {
        type: "category",
        data: trend.months.map(formatMonthLabel),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      series: trend.categories.map((cat, i) => ({
        name: cat.title,
        type: "bar",
        stack: "incidents",
        data: trend.seriesByCategory[cat.id] ?? [],
        itemStyle: { color: PALETTE[i % PALETTE.length] },
      })),
    }
  }, [trend, theme])

  return (
    <ChartCard title="Category Incident Trend" subtitle="จำนวนรายการผิดปกติต่อหมวดรายเดือน">
      <EChart option={option} height={320} />
    </ChartCard>
  )
}
