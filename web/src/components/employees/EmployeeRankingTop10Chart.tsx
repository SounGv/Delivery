import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import type { EmployeeRankEntry } from "@/lib/dashboard-selectors"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

export function EmployeeRankingTop10Chart({ ranking, subtitle }: { ranking: EmployeeRankEntry[]; subtitle: string }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const top10 = ranking.slice(0, 10).reverse()

    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { data: ["พัสดุ", "สินค้า"], textStyle: { color: t.muted }, top: 0 },
      grid: { left: 8, right: 24, top: 32, bottom: 8, containLabel: true },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "category",
        data: top10.map((r) => r.name),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.foreground },
      },
      series: [
        {
          name: "พัสดุ",
          type: "bar",
          data: top10.map((r) => r.totalParcels),
          itemStyle: { color: t.brand, borderRadius: [0, 6, 6, 0] },
        },
        {
          name: "สินค้า",
          type: "bar",
          data: top10.map((r) => r.totalItems),
          itemStyle: { color: t.emerald, borderRadius: [0, 6, 6, 0] },
        },
      ],
    }
  }, [ranking, theme])

  return (
    <ChartCard title="Employee Ranking (Top 10)" subtitle={subtitle}>
      <EChart option={option} height={360} />
    </ChartCard>
  )
}
