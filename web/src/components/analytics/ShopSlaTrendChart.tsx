import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import type { ShopSla } from "@/api/types"
import { formatDateLabel } from "@/lib/format"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#f87171"]

export function ShopSlaTrendChart({ shop, dates }: { shop: ShopSla; dates: string[] }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const sortedDates = [...dates].sort()

    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis" },
      legend: { type: "scroll", top: 0, textStyle: { color: t.muted }, data: shop.criteria.map((_, i) => `เกณฑ์ ${i + 1}`) },
      grid: { left: 8, right: 8, top: 40, bottom: 28, containLabel: true },
      xAxis: {
        type: "category",
        data: sortedDates.map(formatDateLabel),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "value",
        max: 100,
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted, formatter: "{value}%" },
      },
      series: shop.criteria.map((c, i) => ({
        name: `เกณฑ์ ${i + 1}`,
        type: "line",
        smooth: true,
        data: sortedDates.map((d) => c.byDate[d] ?? null),
        itemStyle: { color: PALETTE[i % PALETTE.length] },
        connectNulls: true,
      })),
    }
  }, [shop, dates, theme])

  return (
    <ChartCard title={`Shop SLA Trend — ${shop.shop}`} subtitle="แนวโน้ม 5 เกณฑ์ตามช่วงเวลา">
      <EChart option={option} height={320} />
    </ChartCard>
  )
}
