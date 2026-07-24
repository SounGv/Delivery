import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import type { KpiEvaluation } from "@/lib/dashboard-selectors"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

const GRADE_COLOR: Record<string, string> = {
  A: "#10b981",
  B: "#3b82f6",
  C: "#f59e0b",
  D: "#f87171",
}

export function KpiScoreChart({ evaluations }: { evaluations: KpiEvaluation[] }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const rows = [...evaluations].reverse()

    return {
      textStyle: { color: t.muted },
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const params = p as unknown as { dataIndex: number }
          const row = rows[params.dataIndex]
          if (!row) return ""
          return `${row.name}<br/>ผลงาน: ${row.achievementPct.toFixed(1)}%<br/>หัก: -${row.penaltyPoints.toFixed(1)}%<br/><b>คะแนน: ${row.score.toFixed(1)}% (${row.grade})</b>`
        },
      },
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { color: t.muted, formatter: "{value}%" },
        splitLine: { lineStyle: { color: t.border } },
      },
      yAxis: {
        type: "category",
        data: rows.map((r) => r.name),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.foreground },
      },
      series: [
        {
          name: "คะแนน KPI",
          type: "bar",
          data: rows.map((r) => ({ value: Math.round(r.score * 10) / 10, itemStyle: { color: GRADE_COLOR[r.grade] } })),
          barMinHeight: 2,
          itemStyle: { borderRadius: [0, 6, 6, 0] },
          markLine: {
            symbol: "none",
            label: { formatter: "เป้า 100%", color: t.muted },
            lineStyle: { color: t.muted, type: "dashed" },
            data: [{ xAxis: 100 }],
          },
        },
      ],
    }
  }, [evaluations, theme])

  return (
    <ChartCard title="คะแนน KPI รายบุคคล" subtitle="ผลงานเทียบเป้า หักด้วยข้อผิดพลาดทีม (100% = ถึงเป้าพอดี)">
      <EChart option={option} height={Math.max(280, 36 * evaluations.length + 60)} />
    </ChartCard>
  )
}
