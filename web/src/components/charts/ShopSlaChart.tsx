import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { DashboardResponse } from "@/api/types"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#f87171"]

export function ShopSlaChart({ data }: { data: DashboardResponse }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const criteriaLabels = data.shopSla[0]?.criteria.map((_, i) => `เกณฑ์ ${i + 1}`) ?? []

    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { type: "scroll", top: 0, textStyle: { color: t.muted } },
      grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
      xAxis: {
        type: "value",
        max: 100,
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted, formatter: "{value}%" },
      },
      yAxis: {
        type: "category",
        data: criteriaLabels,
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.foreground },
      },
      series: data.shopSla.map((shop, i) => ({
        name: shop.shop,
        type: "bar",
        data: shop.criteria.map((c) => c.byDate[data.todayDate] ?? null),
        itemStyle: { color: PALETTE[i % PALETTE.length] },
      })),
    }
  }, [data, theme])

  if (data.shopSla.length === 0) return null

  return (
    <ChartCard title="Shopee Shop SLA" subtitle={`เปรียบเทียบ 5 เกณฑ์ต่อร้าน (${data.todayDate})`}>
      <EChart option={option} height={340} />
    </ChartCard>
  )
}
