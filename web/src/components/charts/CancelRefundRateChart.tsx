import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { OrderReportDay } from "@/api/types"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"
import { formatFullDateLabel } from "@/lib/format"

/** Daily cancellation rate vs. refund rate, on separate axes since cancellation
 * rates run roughly an order of magnitude higher than refund rates. */
export function CancelRefundRateChart({ days }: { days: OrderReportDay[] }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const cancelRates = days.map((d) => (d.totalOrders > 0 ? (d.cancelledOrders / d.totalOrders) * 100 : 0))
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(2)}%` },
      legend: { data: ["อัตรายกเลิก", "อัตราคืนเงิน"], top: 0, textStyle: { color: t.muted } },
      grid: { left: 8, right: 16, top: 40, bottom: 28, containLabel: true },
      xAxis: {
        type: "category",
        data: days.map((d) => formatFullDateLabel(d.date)),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: [
        {
          type: "value",
          name: "อัตรายกเลิก",
          position: "left",
          axisLabel: { color: t.muted, formatter: "{value}%" },
          splitLine: { lineStyle: { color: t.border } },
        },
        {
          type: "value",
          name: "อัตราคืนเงิน",
          position: "right",
          axisLabel: { color: t.muted, formatter: "{value}%" },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "อัตรายกเลิก",
          type: "line",
          smooth: true,
          symbol: "none",
          yAxisIndex: 0,
          data: cancelRates,
          itemStyle: { color: t.rose },
          lineStyle: { width: 2 },
        },
        {
          name: "อัตราคืนเงิน",
          type: "line",
          smooth: true,
          symbol: "none",
          yAxisIndex: 1,
          data: days.map((d) => d.refundRate),
          itemStyle: { color: t.emerald },
          lineStyle: { width: 2 },
        },
      ],
    }
  }, [days, theme])

  return (
    <ChartCard title="อัตรายกเลิก vs อัตราคืนเงิน รายวัน" subtitle="แกนซ้าย = อัตรายกเลิก, แกนขวา = อัตราคืนเงิน">
      <EChart option={option} height={300} />
    </ChartCard>
  )
}
