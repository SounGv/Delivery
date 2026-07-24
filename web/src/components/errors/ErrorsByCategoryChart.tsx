import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import type { CategoryCount } from "@/lib/dashboard-selectors"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

export function ErrorsByCategoryChart({ counts }: { counts: CategoryCount[] }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const sorted = [...counts].reverse()

    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "category",
        data: sorted.map((c) => `${c.categoryId}. ${c.categoryTitle}`),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.foreground },
      },
      series: [
        {
          name: "จำนวนรายการ",
          type: "bar",
          data: sorted.map((c) => c.count),
          itemStyle: { color: t.rose, borderRadius: [0, 6, 6, 0] },
        },
      ],
    }
  }, [counts, theme])

  return (
    <ChartCard title="Errors by Category" subtitle="จำนวนรายการผิดปกติสะสมต่อหมวด">
      <EChart option={option} height={Math.max(220, 44 * counts.length + 60)} />
    </ChartCard>
  )
}
