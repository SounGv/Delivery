import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
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

  const workloadOption = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis" },
      legend: { data: ["พัสดุ", "สินค้า"], textStyle: { color: t.muted }, top: 0 },
      ...baseAxes(t, categories),
      series: [
        { name: "พัสดุ", type: "bar", data: series.map((s) => s.totalParcels), itemStyle: { color: t.brand, borderRadius: [4, 4, 0, 0] } },
        { name: "สินค้า", type: "bar", data: series.map((s) => s.totalItems), itemStyle: { color: t.emerald, borderRadius: [4, 4, 0, 0] } },
      ],
    }
  }, [series, categories, theme])

  const productivityOption = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const target = series[0]?.target
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis" },
      ...baseAxes(t, categories),
      series: [
        {
          name: "Productivity",
          type: "line",
          smooth: true,
          data: series.map((s) => Math.round(s.actualProductivity)),
          itemStyle: { color: t.amber },
          areaStyle: { color: t.amber, opacity: 0.12 },
          markLine: target
            ? { symbol: "none", label: { formatter: `เป้า ${target}`, color: t.muted }, lineStyle: { color: t.rose, type: "dashed" }, data: [{ yAxis: target }] }
            : undefined,
        },
      ],
    }
  }, [series, categories, theme])

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
      <ChartCard title="Daily Workload" subtitle="พัสดุ / สินค้า รายวัน">
        <EChart option={workloadOption} height={260} />
      </ChartCard>
      <ChartCard title="Productivity Trend" subtitle="พัสดุ/คน รายวัน เทียบเป้า">
        <EChart option={productivityOption} height={260} />
      </ChartCard>
      <ChartCard title="Employees Working Per Day" subtitle="จำนวนคนทำงานจริงรายวัน">
        <EChart option={headcountOption} height={260} />
      </ChartCard>
    </div>
  )
}
