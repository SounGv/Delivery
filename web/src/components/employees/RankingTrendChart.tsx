import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import type { Employee } from "@/api/types"
import { getEmployeeRankHistory, type ReportPeriod } from "@/lib/dashboard-selectors"
import { formatDateLabel, formatMonthLabel, formatYearLabel } from "@/lib/format"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

function labelFor(key: string, period: ReportPeriod): string {
  if (period === "day") return formatDateLabel(key)
  if (period === "month") return formatMonthLabel(key)
  return formatYearLabel(key)
}

interface RankingTrendChartProps {
  employees: Employee[]
  selectedName: string
  period: ReportPeriod
}

export function RankingTrendChart({ employees, selectedName, period }: RankingTrendChartProps) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const history = getEmployeeRankHistory(employees, period)

    const keySet = new Set<string>()
    Object.values(history).forEach((points) => points.forEach((p) => keySet.add(p.key)))
    const keys = [...keySet].sort()
    const maxRank = employees.length

    const series = employees.map((e) => {
      const isSelected = e.name === selectedName
      const byKey = new Map(history[e.name]?.map((p) => [p.key, p.rank]))
      return {
        name: e.name,
        type: "line" as const,
        data: keys.map((k) => byKey.get(k) ?? null),
        connectNulls: false,
        symbolSize: isSelected ? 7 : 4,
        lineStyle: { width: isSelected ? 3 : 1, color: isSelected ? t.brand : t.muted, opacity: isSelected ? 1 : 0.25 },
        itemStyle: { color: isSelected ? t.brand : t.muted, opacity: isSelected ? 1 : 0.25 },
        z: isSelected ? 10 : 1,
        emphasis: { focus: "series" as const },
      }
    })

    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis" },
      grid: { left: 8, right: 8, top: 16, bottom: 28, containLabel: true },
      xAxis: {
        type: "category",
        data: keys.map((k) => labelFor(k, period)),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "value",
        inverse: true,
        min: 1,
        max: maxRank,
        interval: 1,
        axisLine: { lineStyle: { color: t.border } },
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted, formatter: "#{value}" },
      },
      series,
    }
  }, [employees, selectedName, period, theme])

  return (
    <ChartCard title="Ranking Trend" subtitle={`อันดับของ ${selectedName} เทียบเพื่อนร่วมทีมตามช่วงเวลา (อันดับ 1 = ดีที่สุด)`}>
      <EChart option={option} height={320} />
    </ChartCard>
  )
}
