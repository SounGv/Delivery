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

const TOP_N = 10

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

    // Team-wide view with a big roster: draw only the TOP_N people with the best average
    // rank. Forty lines on a #1-#40 axis are an unreadable tangle pinned to the top.
    const meanRank = (name: string) => {
      const pts = history[name] ?? []
      return pts.length ? pts.reduce((s, p) => s + p.rank, 0) / pts.length : Infinity
    }
    const trimmed = !highlightName && employees.length > TOP_N
    const shown = trimmed ? [...employees].sort((a, b) => meanRank(a.name) - meanRank(b.name)).slice(0, TOP_N) : employees
    const maxRank = trimmed
      ? Math.max(TOP_N, ...shown.flatMap((e) => (history[e.name] ?? []).map((p) => p.rank)))
      : employees.length

    const series = shown.map((e, idx) => {
      const base = t.linePalette[idx % t.linePalette.length]!
      const isHighlighted = highlightName ? e.name === highlightName : false
      const isDimmed = highlightName ? !isHighlighted : false
      const byKey = new Map(history[e.name]?.map((p) => [p.key, p.rank]))
      return {
        name: e.name,
        type: "line" as const,
        data: keys.map((k) => byKey.get(k) ?? null),
        connectNulls: false,
        smooth: true,
        symbolSize: isHighlighted ? 8 : 5,
        // Team-wide view: each person gets their own palette color. With a highlighted
        // person everyone else falls back to muted grey so that one line stands out.
        lineStyle: {
          width: isHighlighted ? 4 : highlightName ? 1.5 : 2.5,
          color: highlightName ? (isHighlighted ? t.brand : t.muted) : base,
          opacity: isDimmed ? 0.25 : 1,
        },
        itemStyle: { color: highlightName ? (isHighlighted ? t.brand : t.muted) : base, opacity: isDimmed ? 0.25 : 1 },
        z: isHighlighted ? 10 : 1,
        emphasis: { focus: "series" as const },
      }
    })

    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", ...t.tooltip },
      legend: highlightName
        ? undefined
        : { type: "scroll", bottom: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: t.muted } },
      grid: { left: 8, right: 12, top: 16, bottom: highlightName ? 28 : 40, containLabel: true },
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
        interval: maxRank > 12 ? Math.ceil(maxRank / 8) : 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: t.border, type: "dashed" } },
        axisLabel: { color: t.muted, formatter: "#{value}" },
      },
      series,
    }
  }, [employees, highlightName, period, theme])

  const resolvedSubtitle =
    subtitle ??
    (highlightName
      ? `อันดับของ ${highlightName} เทียบเพื่อนร่วมทีมตามช่วงเวลา (อันดับ 1 = ดีที่สุด) — เส้นขึ้น (เลขอันดับน้อยลง) หมายถึงผลงานดีขึ้น`
      : employees.length > TOP_N
        ? `${TOP_N} คนที่อันดับเฉลี่ยดีที่สุด (อันดับ 1 = ดีที่สุด) — เส้นขึ้น (เลขอันดับน้อยลง) หมายถึงผลงานดีขึ้น`
        : "อันดับพนักงานทุกคนตามช่วงเวลา (อันดับ 1 = ดีที่สุด) — เส้นขึ้น (เลขอันดับน้อยลง) หมายถึงผลงานดีขึ้น")

  return (
    <ChartCard emoji="🏅" title={title ?? "อันดับผลงานตามวัน"} subtitle={resolvedSubtitle}>
      <EChart option={option} height={height} />
    </ChartCard>
  )
}
