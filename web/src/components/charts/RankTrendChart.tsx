import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
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

interface RankTrendChartProps {
  employees: Employee[]
  period: ReportPeriod
  /** Highlights one employee's line against everyone else, muted. Omit for a
   * team-wide overview where every line renders at equal weight. */
  highlightName?: string
  title?: string
  subtitle?: string
  height?: number
}

/** Rank-over-time line chart with an INVERTED y-axis (rank #1 at the top) —
 * a line trending upward (rank number getting smaller) means that person's
 * standing is improving, not declining. */
export function RankTrendChart({ employees, period, highlightName, title, subtitle, height = 320 }: RankTrendChartProps) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const history = getEmployeeRankHistory(employees, period)

    const keySet = new Set<string>()
    Object.values(history).forEach((points) => points.forEach((p) => keySet.add(p.key)))
    const keys = [...keySet].sort()
    const maxRank = employees.length

    const series = employees.map((e) => {
      const isHighlighted = highlightName ? e.name === highlightName : false
      const isDimmed = highlightName ? !isHighlighted : false
      const byKey = new Map(history[e.name]?.map((p) => [p.key, p.rank]))
      return {
        name: e.name,
        type: "line" as const,
        data: keys.map((k) => byKey.get(k) ?? null),
        connectNulls: false,
        symbolSize: isHighlighted ? 7 : 4,
        lineStyle: { width: isHighlighted ? 3 : 1, color: isHighlighted ? t.brand : t.muted, opacity: isDimmed ? 0.25 : isHighlighted ? 1 : 0.6 },
        itemStyle: { color: isHighlighted ? t.brand : t.muted, opacity: isDimmed ? 0.25 : isHighlighted ? 1 : 0.6 },
        z: isHighlighted ? 10 : 1,
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
  }, [employees, highlightName, period, theme])

  const resolvedSubtitle =
    subtitle ??
    (highlightName
      ? `อันดับของ ${highlightName} เทียบเพื่อนร่วมทีมตามช่วงเวลา (อันดับ 1 = ดีที่สุด) — เส้นขึ้น (เลขอันดับน้อยลง) หมายถึงผลงานดีขึ้น`
      : "อันดับพนักงานทุกคนตามช่วงเวลา (อันดับ 1 = ดีที่สุด) — เส้นขึ้น (เลขอันดับน้อยลง) หมายถึงผลงานดีขึ้น")

  return (
    <ChartCard title={title ?? "อันดับผลงานตามวัน"} subtitle={resolvedSubtitle}>
      <EChart option={option} height={height} />
    </ChartCard>
  )
}
