import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { DashboardResponse } from "@/api/types"
import { formatDateLabel } from "@/lib/format"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

export function ProductivityHeatmap({ data }: { data: DashboardResponse }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const dates = [...data.dates].sort()
    const employees = data.employees.map((e) => e.name)

    const cells: [number, number, number][] = []
    let max = 0
    employees.forEach((name, yi) => {
      const employee = data.employees.find((e) => e.name === name)
      dates.forEach((d, xi) => {
        const items = employee?.byDate[d]?.items ?? null
        if (items !== null) {
          cells.push([xi, yi, items])
          if (items > max) max = items
        }
      })
    })

    return {
      textStyle: { color: t.muted },
      tooltip: {
        position: "top",
        formatter: (p) => {
          const params = p as unknown as { data: [number, number, number] }
          const [xi, yi, v] = params.data
          return `${employees[yi]} · ${formatDateLabel(dates[xi] ?? "")}: ${v} ชิ้น`
        },
      },
      grid: { left: 8, right: 8, top: 16, bottom: 46, containLabel: true },
      xAxis: {
        type: "category",
        data: dates.map(formatDateLabel),
        splitArea: { show: true },
        axisLabel: { color: t.muted, rotate: 45 },
      },
      yAxis: {
        type: "category",
        data: employees,
        splitArea: { show: true },
        axisLabel: { color: t.foreground },
      },
      visualMap: {
        min: 0,
        max: max || 1,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        textStyle: { color: t.muted },
        inRange: { color: ["rgba(59,130,246,0.08)", t.brand, t.emerald] },
      },
      series: [
        {
          type: "heatmap",
          data: cells,
          itemStyle: { borderRadius: 4, borderColor: "transparent", borderWidth: 2 },
          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.3)" } },
        },
      ],
    }
  }, [data, theme])

  return (
    <ChartCard title="Employee Productivity Heatmap" subtitle="จำนวนสินค้าต่อคนต่อวัน">
      <EChart option={option} height={Math.max(280, 40 * data.employees.length + 80)} />
    </ChartCard>
  )
}
