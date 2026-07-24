import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { EChart } from "@/components/charts/EChart"
import { ChartCard } from "@/components/charts/ChartCard"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"
import { formatDateLabel, formatMonthLabel } from "@/lib/format"
import { OT_TYPE_LABEL, type OtRecord, type OtType } from "@/lib/ot"

export function OtReportCharts({ records }: { records: OtRecord[] }) {
  const { theme } = useTheme()

  const daily = useMemo(() => {
    const t = readChartTheme()
    const map = new Map<string, number>()
    for (const r of records) map.set(r.date, (map.get(r.date) ?? 0) + r.otHours)
    const dates = [...map.keys()].sort()
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis" },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: dates.map(formatDateLabel), axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.muted, fontSize: 10 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.muted } },
      series: [{ name: "ชั่วโมง OT", type: "bar", data: dates.map((d) => Math.round((map.get(d) ?? 0) * 100) / 100), itemStyle: { color: t.brand, borderRadius: [4, 4, 0, 0] } }],
    } as EChartsOption
  }, [records, theme])

  const perPerson = useMemo(() => {
    const t = readChartTheme()
    const map = new Map<string, number>()
    for (const r of records) map.set(r.employeeName, (map.get(r.employeeName) ?? 0) + r.otHours)
    const sorted = [...map.entries()].sort((a, b) => a[1] - b[1])
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      xAxis: { type: "value", splitLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.muted } },
      yAxis: { type: "category", data: sorted.map((s) => s[0]), axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.foreground } },
      series: [{ name: "ชั่วโมง OT", type: "bar", data: sorted.map((s) => Math.round(s[1] * 100) / 100), itemStyle: { color: t.emerald, borderRadius: [0, 6, 6, 0] } }],
    } as EChartsOption
  }, [records, theme])

  const byType = useMemo(() => {
    const t = readChartTheme()
    const map = new Map<OtType, number>()
    for (const r of records) map.set(r.otType, (map.get(r.otType) ?? 0) + r.otHours)
    const colors: Record<string, string> = { OT_AFTER_WORK: t.brand, OT_ON_DAY_OFF: t.rose, WORKED_ON_DAY_OFF: t.amber, NONE: t.muted }
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "item", formatter: "{b}: {c} ชม. ({d}%)" },
      legend: { bottom: 0, textStyle: { color: t.muted } },
      series: [
        {
          name: "ประเภท OT",
          type: "pie",
          radius: ["40%", "68%"],
          center: ["50%", "44%"],
          label: { color: t.foreground, fontSize: 11 },
          data: [...map.entries()].map(([type, hrs]) => ({ name: OT_TYPE_LABEL[type], value: Math.round(hrs * 100) / 100, itemStyle: { color: colors[type] } })),
        },
      ],
    } as EChartsOption
  }, [records, theme])

  const hoursMonthly = useMemo(() => {
    const t = readChartTheme()
    const map = new Map<string, number>()
    for (const r of records) {
      const m = r.date.slice(0, 7)
      map.set(m, (map.get(m) ?? 0) + r.otHours)
    }
    const months = [...map.keys()].sort()
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", valueFormatter: (v: unknown) => `${Number(v).toLocaleString("th-TH")} ชม.` },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: months.map(formatMonthLabel), axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.muted, fontSize: 10 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.muted } },
      series: [{ name: "ชั่วโมง OT", type: "bar", data: months.map((m) => Math.round((map.get(m) ?? 0) * 10) / 10), itemStyle: { color: t.amber, borderRadius: [4, 4, 0, 0] } }],
    } as EChartsOption
  }, [records, theme])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="OT รายวัน" subtitle="ชั่วโมง OT รวมต่อวัน"><EChart option={daily} height={260} /></ChartCard>
      <ChartCard title="OT รายบุคคล" subtitle="ชั่วโมง OT รวมต่อคน"><EChart option={perPerson} height={260} /></ChartCard>
      <ChartCard title="OT แยกประเภท" subtitle="สัดส่วนชั่วโมงตามประเภท OT"><EChart option={byType} height={260} /></ChartCard>
      <ChartCard title="OT รายเดือน" subtitle="ชั่วโมง OT รวมต่อเดือน"><EChart option={hoursMonthly} height={260} /></ChartCard>
    </div>
  )
}
