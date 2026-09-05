import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

export interface BarLineChartBarSeries {
  name: string
  data: number[]
  color?: string
}

export interface BarLineChartLineSeries {
  name: string
  data: (number | null)[]
  color?: string
}

export interface BarLineChartProps {
  categories: string[]
  /** 1-2 series rendered as bars on the LEFT axis. */
  bars: BarLineChartBarSeries[]
  /** One trend/target series rendered as a line on the RIGHT axis. */
  line: BarLineChartLineSeries
  leftAxisFormatter?: (v: number) => string
  rightAxisFormatter?: (v: number) => string
  height?: number
}

/** BigSeller-style dual-axis combo chart: bar series (left axis) + one trend/
 * target line (right axis), legend at bottom, thin grid, rounded bar tops.
 * A bare chart only — wrap it in `ChartCard` for a title/subtitle, same as
 * every other chart component in this app. */
export function BarLineChart({ categories, bars, line, leftAxisFormatter, rightAxisFormatter, height = 300 }: BarLineChartProps) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const defaultFormat = (v: number) => v.toLocaleString("th-TH")

    return {
      textStyle: { color: t.muted },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params]
          // `axisValueLabel` is present at runtime for axis-trigger tooltips but
          // missing from this echarts version's CallbackDataParams typing.
          const head = (arr[0] as { axisValueLabel?: string } | undefined)?.axisValueLabel ?? ""
          const rows = arr.map((p) => {
            const isLine = p.seriesType === "line"
            const fmt = isLine ? rightAxisFormatter ?? defaultFormat : leftAxisFormatter ?? defaultFormat
            const value = typeof p.value === "number" ? fmt(p.value) : "-"
            return `${p.marker ?? ""} ${p.seriesName}: ${value}`
          })
          return [head, ...rows].join("<br/>")
        },
      },
      legend: { bottom: 0, textStyle: { color: t.muted }, data: [...bars.map((b) => b.name), line.name] },
      grid: { left: 8, right: 16, top: 24, bottom: 48, containLabel: true },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: [
        {
          type: "value",
          position: "left",
          axisLabel: { color: t.muted, formatter: leftAxisFormatter },
          splitLine: { lineStyle: { color: t.border } },
        },
        {
          type: "value",
          position: "right",
          axisLabel: { color: t.muted, formatter: rightAxisFormatter },
          splitLine: { show: false },
        },
      ],
      series: [
        ...bars.map((b, i) => ({
          name: b.name,
          type: "bar" as const,
          data: b.data,
          yAxisIndex: 0,
          barMaxWidth: 20,
          itemStyle: { color: b.color ?? t.barColors[i % t.barColors.length], borderRadius: [3, 3, 0, 0] as [number, number, number, number] },
        })),
        {
          name: line.name,
          type: "line" as const,
          data: line.data,
          yAxisIndex: 1,
          symbol: "circle",
          symbolSize: 6,
          smooth: true,
          itemStyle: { color: line.color ?? t.trendLine },
          lineStyle: { width: 2.5, color: line.color ?? t.trendLine },
        },
      ],
    }
  }, [categories, bars, line, leftAxisFormatter, rightAxisFormatter, theme])

  return <EChart option={option} height={height} />
}
