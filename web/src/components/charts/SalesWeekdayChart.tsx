import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "./EChart"
import { ChartCard } from "./ChartCard"
import type { OrderReportDay } from "@/api/types"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"
import { WEEKDAY_LABELS_TH, WEEKDAY_LABELS_TH_FULL, weekdayAverages } from "@/lib/order-report-selectors"

/** Average effective-order sales per weekday (Mon-Sun) — best day highlighted in emerald, worst in rose. */
export function SalesWeekdayChart({ days }: { days: OrderReportDay[] }) {
  const { theme } = useTheme()

  const averages = useMemo(() => weekdayAverages(days), [days])
  const bestIdx = averages.indexOf(Math.max(...averages))
  const worstIdx = averages.indexOf(Math.min(...averages))

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    return {
      textStyle: { color: t.muted },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v) => `฿${Number(v).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`,
      },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: WEEKDAY_LABELS_TH,
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted, formatter: (v: number) => `${(v / 1e6).toFixed(1)}M` },
      },
      series: [
        {
          name: "เฉลี่ยยอดขาย",
          type: "bar",
          data: averages.map((v, i) => ({
            value: v,
            itemStyle: { color: i === bestIdx ? t.emerald : i === worstIdx ? t.rose : t.brand, opacity: i === bestIdx || i === worstIdx ? 1 : 0.55 },
          })),
          barMaxWidth: 42,
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    }
  }, [averages, bestIdx, worstIdx, theme])

  return (
    <ChartCard
      title="ยอดขายเฉลี่ยตามวันในสัปดาห์"
      subtitle={`ขายดีสุด: ${WEEKDAY_LABELS_TH_FULL[bestIdx]} · ขายน้อยสุด: ${WEEKDAY_LABELS_TH_FULL[worstIdx]}`}
    >
      <EChart option={option} height={320} />
    </ChartCard>
  )
}
