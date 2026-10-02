import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard, ChartChip } from "./ChartCard"
import type { DashboardResponse } from "@/api/types"
import { formatDateLabel } from "@/lib/format"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

export function ProductivityHeatmap({ data }: { data: DashboardResponse }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    // Last 30 days up to the latest day with data — monthly tabs pre-create every calendar
    // day, so "all dates" would stretch the grid across empty/future months.
    const dates = [...data.dates].sort().filter((d) => d <= data.todayDate).slice(-30)
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
        ...t.tooltip,
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
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: t.muted, rotate: 45 },
      },
      yAxis: {
        type: "category",
        data: employees,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
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
        inRange: { color: ["rgba(43,168,162,0.10)", t.brand, t.gold] },
      },
      series: [
        {
          type: "heatmap",
          data: cells,
          itemStyle: { borderRadius: 6, borderColor: t.card, borderWidth: 3 },
          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.3)" } },
        },
      ],
    }
  }, [data, theme])

  return (
    <ChartCard
      emoji="🔥"
      title="ความหนาแน่นผลงานรายคน"
      subtitle="จำนวนสินค้าต่อคนต่อวัน · 30 วันล่าสุด"
      actions={<ChartChip>ยิ่งสีเข้ม/ทอง ยิ่งทำได้มาก</ChartChip>}
    >
      <EChart option={option} height={Math.max(280, 40 * data.employees.length + 80)} />
    </ChartCard>
  )
}
