import { useMemo } from "react"
import type { EChartsOption } from "echarts"
import { ChartCard } from "@/components/charts/ChartCard"
import { EChart } from "@/components/charts/EChart"
import { KIND_COLOR, KIND_LABEL, NO_DATE, TONE_COLOR, TONE_LABEL, type Bucket, type TimelineItem } from "@/lib/cancel-return-timeline"
import { readChartTheme } from "@/lib/chart-theme"
import { formatFullDateLabel, formatMonthLabel } from "@/lib/format"
import { useTheme } from "@/lib/theme"

const num = (n: number) => n.toLocaleString("th-TH")

/** A vertical fade of one colour, so bars read as solid objects instead of flat blocks. */
const fade = (color: string) => ({
  type: "linear" as const,
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color },
    { offset: 1, color: `${color}99` },
  ],
})

/** Stacked bars per day or per month (cancelled / returned / lost) with the "still to chase" line on top. */
export function TrendChart({ buckets, mode, scopeLabel }: { buckets: Bucket[]; mode: "month" | "day"; scopeLabel: string }) {
  const { theme } = useTheme()
  const data = useMemo(() => buckets.filter((b) => b.key !== NO_DATE).sort((a, b) => a.key.localeCompare(b.key)), [buckets])

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    const label = (key: string) => (mode === "month" ? formatMonthLabel(key) : String(Number(key.slice(8))))
    const tip = (key: string) => (mode === "month" ? formatMonthLabel(key) : formatFullDateLabel(key))
    const bar = (name: string, color: string, pick: (b: Bucket) => number, top: boolean) => ({
      name,
      type: "bar" as const,
      stack: "kind",
      barMaxWidth: mode === "month" ? 64 : 26,
      data: data.map(pick),
      itemStyle: { color: fade(color), borderRadius: top ? [8, 8, 0, 0] : 0 },
      emphasis: { focus: "series" as const },
    })
    return {
      textStyle: { color: t.muted },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: t.tooltip.backgroundColor,
        borderColor: t.tooltip.borderColor,
        textStyle: t.tooltip.textStyle,
        extraCssText: t.tooltip.extraCssText,
        formatter: (raw) => {
          const params = Array.isArray(raw) ? raw : [raw]
          const idx = (params[0] as { dataIndex?: number } | undefined)?.dataIndex ?? 0
          const row = data[idx]
          if (!row) return ""
          const line = (name: string, color: string, value: number) =>
            `<div style="display:flex;justify-content:space-between;gap:16px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:6px"></i>${name}</span><b>${num(value)}</b></div>`
          return `<div style="min-width:170px"><div style="font-weight:800;margin-bottom:4px">${tip(row.key)}</div>${line(KIND_LABEL.cancel, KIND_COLOR.cancel, row.cancel)}${line(KIND_LABEL.return, KIND_COLOR.return, row.ret)}${line(KIND_LABEL.lost, KIND_COLOR.lost, row.lost)}<div style="margin-top:4px;border-top:1px dashed ${t.border};padding-top:4px">${line("ค้างต้องตาม", t.trendLine, row.open)}</div></div>`
        },
      },
      legend: { top: 0, textStyle: { color: t.muted }, itemWidth: 12, itemHeight: 12, icon: "roundRect" },
      grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: data.map((b) => label(b.key)),
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        axisLabel: { color: t.muted, interval: mode === "day" ? 0 : "auto" },
      },
      yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: t.border, type: "dashed" } }, axisLabel: { color: t.muted } },
      series: [
        bar(KIND_LABEL.cancel, KIND_COLOR.cancel, (b) => b.cancel, false),
        bar(KIND_LABEL.return, KIND_COLOR.return, (b) => b.ret, false),
        bar(KIND_LABEL.lost, KIND_COLOR.lost, (b) => b.lost, true),
        {
          name: "ค้างต้องตาม",
          type: "line" as const,
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          data: data.map((b) => b.open),
          lineStyle: { color: t.trendLine, width: 3, shadowColor: `${t.trendLine}66`, shadowBlur: 10, shadowOffsetY: 4 },
          itemStyle: { color: t.trendLine, borderColor: t.card, borderWidth: 2 },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${t.trendLine}33` },
                { offset: 1, color: `${t.trendLine}00` },
              ],
            },
          },
          z: 5,
        },
      ],
    }
    // theme is read inside readChartTheme(); it changes the resolved CSS colours, so it must retrigger this memo.
  }, [data, mode, theme])

  return (
    <ChartCard
      title={mode === "month" ? "แนวโน้มรายเดือน" : "แนวโน้มรายวัน"}
      subtitle={`ยกเลิก / ตีกลับ / สูญหาย และจำนวนที่ค้างต้องตาม · ${scopeLabel}`}
      emoji="📊"
      className="shadow-[0_18px_40px_-22px_rgba(43,168,162,0.5)]"
    >
      {data.length > 0 ? <EChart option={option} height={300} /> : <p className="py-16 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงนี้</p>}
    </ChartCard>
  )
}

/** Donut of where every line stands (done / waiting / problem / partly done), total in the middle. */
export function StatusDonut({ items, scopeLabel }: { items: TimelineItem[]; scopeLabel: string }) {
  const { theme } = useTheme()
  const groups = useMemo(() => {
    const order = ["ok", "warn", "info", "danger", "neutral"] as const
    const counts = new Map<(typeof order)[number], number>()
    for (const it of items) {
      const tone = it.status.open && it.status.tone === "info" ? "info" : it.status.tone
      counts.set(tone, (counts.get(tone) ?? 0) + 1)
    }
    return order.filter((k) => counts.has(k)).map((k) => ({ tone: k, label: TONE_LABEL[k], color: TONE_COLOR[k], value: counts.get(k) ?? 0 }))
  }, [items])
  const total = items.length

  const option = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    return {
      tooltip: {
        trigger: "item",
        backgroundColor: t.tooltip.backgroundColor,
        borderColor: t.tooltip.borderColor,
        textStyle: t.tooltip.textStyle,
        extraCssText: t.tooltip.extraCssText,
        formatter: "{b}: <b>{c}</b> ({d}%)",
      },
      title: {
        text: num(total),
        subtext: "รายการ",
        left: "center",
        top: "36%",
        textStyle: { color: t.foreground, fontSize: 30, fontWeight: 800 },
        subtextStyle: { color: t.muted, fontSize: 12 },
        itemGap: 2,
      },
      series: [
        {
          type: "pie",
          radius: ["62%", "86%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: { borderRadius: 10, borderColor: t.card, borderWidth: 4, shadowBlur: 14, shadowColor: "rgba(43,168,162,0.25)", shadowOffsetY: 5 },
          emphasis: { scaleSize: 6 },
          data: groups.map((g) => ({ name: g.label, value: g.value, itemStyle: { color: g.color } })),
        },
      ],
    }
    // theme re-resolves the CSS colours read by readChartTheme().
  }, [groups, total, theme])

  return (
    <ChartCard
      title="สถานะภาพรวม"
      subtitle={`ตอนนี้แต่ละรายการอยู่ตรงไหน · ${scopeLabel}`}
      emoji="🎯"
      className="shadow-[0_18px_40px_-22px_rgba(43,168,162,0.5)]"
    >
      {total > 0 ? (
        <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <EChart option={option} height={220} />
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.tone} className="flex items-center gap-2.5 text-sm">
                <span className="size-3 shrink-0 rounded-full shadow-sm" style={{ background: g.color }} aria-hidden />
                <span className="min-w-0 flex-1 font-semibold text-foreground">{g.label}</span>
                <span className="tabular-nums text-foreground">
                  <b>{num(g.value)}</b> <span className="text-xs text-muted-foreground">({((g.value / total) * 100).toFixed(0)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงนี้</p>
      )}
    </ChartCard>
  )
}
