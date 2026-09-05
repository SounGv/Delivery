import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import { BarLineChart } from "@/components/charts/BarLineChart"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"
import { formatDateLabel } from "@/lib/format"
import type { DailyWorkforceStat } from "@/lib/workforce"

function baseAxes(t: ReturnType<typeof readChartTheme>, categories: string[]) {
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true } as const,
    xAxis: {
      type: "category" as const,
      data: categories,
      axisLine: { lineStyle: { color: t.border } },
      axisLabel: { color: t.muted, fontSize: 10 },
    },
    yAxis: {
      type: "value" as const,
      splitLine: { lineStyle: { color: t.border } },
      axisLabel: { color: t.muted },
    },
  }
}

export function WorkloadAnalyticsCharts({ series }: { series: DailyWorkforceStat[] }) {
  const { theme } = useTheme()
  const categories = useMemo(() => series.map((s) => formatDateLabel(s.date)), [series])

  const headcountOption = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis" },
      ...baseAxes(t, categories),
      series: [
        {
          name: "พนักงานที่ทำงาน",
          type: "bar",
          data: series.map((s) => s.activeEmployeeCount),
          itemStyle: { color: t.emerald, borderRadius: [4, 4, 0, 0] },
        },
      ],
    }
  }, [series, categories, theme])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <ChartCard title="ผลงานรวมเทียบ Productivity" subtitle="พัสดุ / สินค้า รายวัน เทียบ productivity ต่อคน" className="lg:col-span-2">
        <BarLineChart
          categories={categories}
          bars={[
            { name: "พัสดุ", data: series.map((s) => s.totalParcels) },
            { name: "สินค้า", data: series.map((s) => s.totalItems) },
          ]}
          line={{ name: "Productivity (พัสดุ/คน)", data: series.map((s) => Math.round(s.actualProductivity)) }}
          height={280}
        />
      </ChartCard>
      <ChartCard title="Employees Working Per Day" subtitle="จำนวนคนทำงานจริงรายวัน">
        <EChart option={headcountOption} height={280} />
      </ChartCard>
    </div>
  )
}
