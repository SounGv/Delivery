import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { DashboardResponse } from "@/api/types"
import { rankEmployeesForDate } from "@/lib/dashboard-selectors"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

export function EmployeeRankingChart({ data }: { data: DashboardResponse }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const ranking = rankEmployeesForDate(data.employees, data.todayDate).reverse()
    const target = data.target?.value ?? undefined

    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "category",
        data: ranking.map((r) => r.name),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.foreground },
      },
      series: [
        {
          name: "พัสดุ",
          type: "bar",
          data: ranking.map((r) => r.parcels ?? 0),
          itemStyle: { color: t.brand, borderRadius: [0, 6, 6, 0] },
          markLine: target
            ? {
                symbol: "none",
                label: { formatter: `เป้า ${target}`, color: t.muted },
                lineStyle: { color: t.amber, type: "dashed" },
                data: [{ xAxis: target }],
              }
            : undefined,
        },
      ],
    }
  }, [data, theme])

  return (
    <ChartCard title="Employee Ranking" subtitle={`อันดับตามพัสดุ ตามด้วยจำนวนสินค้า (${data.todayDate})`}>
      <EChart option={option} height={320} />
    </ChartCard>
  )
}
