import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { DashboardResponse } from "@/api/types"
import { formatDateLabel } from "@/lib/format"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

export function OutputTrendChart({ data }: { data: DashboardResponse }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const dates = [...data.dates].sort()
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis" },
      legend: { data: ["พัสดุ", "สินค้า"], textStyle: { color: t.muted }, top: 0 },
      grid: { left: 8, right: 8, top: 40, bottom: 28, containLabel: true },
      toolbox: {
        feature: { saveAsImage: { title: "Export PNG" } },
        right: 8,
        top: 0,
        iconStyle: { borderColor: t.muted },
      },
      xAxis: {
        type: "category",
        data: dates.map(formatDateLabel),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      series: [
        {
          name: "พัสดุ",
          type: "line",
          smooth: true,
          areaStyle: { opacity: 0.12 },
          data: dates.map((d) => data.teamTotalsByDate[d]?.parcels ?? 0),
          itemStyle: { color: t.brand },
          lineStyle: { width: 2.5 },
        },
        {
          name: "สินค้า",
          type: "line",
          smooth: true,
          areaStyle: { opacity: 0.12 },
          data: dates.map((d) => data.teamTotalsByDate[d]?.items ?? 0),
          itemStyle: { color: t.emerald },
          lineStyle: { width: 2.5 },
        },
      ],
    }
  }, [data, theme])

  return (
    <ChartCard title="Output Trend" subtitle="พัสดุ / สินค้า รวมทีม รายวัน">
      <EChart option={option} height={300} />
    </ChartCard>
  )
}
