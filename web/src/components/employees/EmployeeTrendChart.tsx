import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import type { PeriodBucket, ReportPeriod } from "@/lib/dashboard-selectors"
import { formatDateLabel, formatMonthLabel, formatYearLabel } from "@/lib/format"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

function labelFor(key: string, period: ReportPeriod): string {
  if (period === "day") return formatDateLabel(key)
  if (period === "month") return formatMonthLabel(key)
  return formatYearLabel(key)
}

interface EmployeeTrendChartProps {
  employeeName: string
  period: ReportPeriod
  buckets: PeriodBucket[]
}

export function EmployeeTrendChart({ employeeName, period, buckets }: EmployeeTrendChartProps) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const labels = buckets.map((b) => labelFor(b.key, period))

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
        data: labels,
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
          type: "bar",
          data: buckets.map((b) => b.parcels),
          itemStyle: { color: t.brand, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "สินค้า",
          type: "bar",
          data: buckets.map((b) => b.items),
          itemStyle: { color: t.emerald, borderRadius: [4, 4, 0, 0] },
        },
      ],
    }
  }, [buckets, period, theme])

  const subtitleByPeriod: Record<ReportPeriod, string> = {
    day: "รายวัน",
    month: "รายเดือน",
    year: "รายปี",
  }

  return (
    <ChartCard title={`ผลงานของ ${employeeName}`} subtitle={`มุมมอง${subtitleByPeriod[period]}`}>
      <EChart option={option} height={320} />
    </ChartCard>
  )
}
