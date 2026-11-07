import { useMemo, useState } from "react"
import { ChartCard } from "./ChartCard"
import type { DashboardResponse } from "@/api/types"
import { formatDateLabel } from "@/lib/format"
import { WEEKDAY_LABELS_TH } from "@/lib/order-report-selectors"
import { chipClass } from "@/components/returns/ReturnsUi"
import { cn } from "@/lib/utils"

const RANGE_CHOICES = [7, 14, 30] as const
const num = (n: number) => n.toLocaleString("th-TH")

/** Four shades of the brand colour + "no record". The number is printed inside every cell, so the
 * colour only helps the eye find the strong and weak days — it never carries the value alone. */
const LEVEL_CLASS = [
  "bg-primary/15 text-foreground",
  "bg-primary/30 text-foreground",
  "bg-primary/55 text-foreground",
  "bg-primary text-primary-foreground",
] as const

/** Value at the given 0..1 position of an ascending-sorted list. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
}

/** Items per person per day over the last days that have data, one row per person. Built as a plain
 * table instead of a chart so every cell can show its number, the name column stays in view while
 * scrolling sideways, and people with no record in the window can be folded away. */
export function ProductivityHeatmap({ data }: { data: DashboardResponse }) {
  const [range, setRange] = useState<(typeof RANGE_CHOICES)[number]>(14)
  const [showInactive, setShowInactive] = useState(false)

  const view = useMemo(() => {
    // Only days up to the latest one with data: monthly tabs pre-create every calendar day,
    // so "all dates" would stretch the grid across empty future days.
    const dates = [...data.dates].sort().filter((d) => d <= data.todayDate).slice(-range)
    const rows = data.employees.map((e) => {
      const values = dates.map((d) => e.byDate[d]?.items ?? null)
      const present = values.filter((v): v is number => v !== null)
      const total = present.reduce((s, v) => s + v, 0)
      return { name: e.name, values, total, days: present.length }
    })
    const active = rows.filter((r) => r.days > 0).sort((a, b) => b.total - a.total)
    const inactive = rows.filter((r) => r.days === 0)
    const positive = active.flatMap((r) => r.values).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b)
    const cuts = [percentile(positive, 0.25), percentile(positive, 0.5), percentile(positive, 0.75)]
    return { dates, active, inactive, cuts }
  }, [data, range])

  const levelOf = (v: number) => (v <= view.cuts[0]! ? 0 : v <= view.cuts[1]! ? 1 : v <= view.cuts[2]! ? 2 : 3)
  const shown = showInactive ? [...view.active, ...view.inactive] : view.active
  const headers = view.dates.map((d) => {
    const [day, month] = formatDateLabel(d).split(" ")
    const dow = (new Date(`${d}T00:00:00`).getDay() + 6) % 7
    return { iso: d, day, month, weekday: WEEKDAY_LABELS_TH[dow] ?? "", weekend: dow >= 5, isLatest: d === view.dates[view.dates.length - 1] }
  })

  return (
    <ChartCard
      emoji="🔥"
      title="ความหนาแน่นผลงานรายคน"
      subtitle={`จำนวนสินค้า (ชิ้น) ต่อคนต่อวัน · ${view.dates.length} วันล่าสุดที่มีข้อมูล · เรียงจากทำได้มากไปน้อย`}
      actions={
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="ช่วงวันที่แสดง">
          {RANGE_CHOICES.map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r} className={chipClass(range === r)}>
              {r} วัน
            </button>
          ))}
        </div>
      }
    >
      {view.active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูลผลงานรายคนในช่วงนี้</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="font-bold text-foreground">ระดับผลงาน (ชิ้น/วัน)</span>
            {LEVEL_CLASS.map((cls, i) => (
              <span key={cls} className="inline-flex items-center gap-1.5">
                <span className={cn("inline-block h-4 w-6 rounded", cls)} aria-hidden />
                {i === 0 && `น้อย ≤ ${num(view.cuts[0]!)}`}
                {i === 1 && `ปานกลาง ≤ ${num(view.cuts[1]!)}`}
                {i === 2 && `ดี ≤ ${num(view.cuts[2]!)}`}
                {i === 3 && `สูง > ${num(view.cuts[2]!)}`}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-4 w-6 rounded border border-dashed border-border" aria-hidden />
              ไม่มีบันทึก
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-36 bg-card px-2 py-1 text-left text-xs font-bold text-muted-foreground">พนักงาน</th>
                  {headers.map((h) => (
                    <th
                      key={h.iso}
                      title={formatDateLabel(h.iso)}
                      className={cn(
                        "min-w-11 rounded-md px-1 py-1 text-center font-semibold leading-tight",
                        h.weekend ? "bg-muted text-muted-foreground" : "text-foreground",
                        h.isLatest && "ring-2 ring-primary"
                      )}
                    >
                      <span className="block text-[10px] font-medium text-muted-foreground">{h.weekday}</span>
                      <span className="block text-sm font-extrabold tabular-nums">{h.day}</span>
                      <span className="block text-[10px] font-medium text-muted-foreground">{h.month}</span>
                    </th>
                  ))}
                  <th className="min-w-20 px-2 py-1 text-right text-xs font-bold text-muted-foreground">รวม</th>
                  <th className="min-w-20 px-2 py-1 text-right text-xs font-bold text-muted-foreground">เฉลี่ย/วัน</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.name}>
                    <th className="sticky left-0 z-10 truncate bg-card px-2 py-1 text-left text-sm font-bold text-foreground" title={r.name}>
                      {r.name}
                    </th>
                    {r.values.map((v, i) => (
                      <td
                        key={headers[i]?.iso}
                        title={v === null ? `${r.name} · ${formatDateLabel(headers[i]?.iso ?? "")}: ไม่มีบันทึก` : `${r.name} · ${formatDateLabel(headers[i]?.iso ?? "")}: ${num(v)} ชิ้น`}
                        className={cn(
                          "h-9 rounded-md text-center font-bold tabular-nums",
                          v === null ? "border border-dashed border-border text-muted-foreground/50" : LEVEL_CLASS[levelOf(v)]
                        )}
                      >
                        {v === null ? "·" : num(v)}
                      </td>
                    ))}
                    <td className="px-2 text-right text-sm font-extrabold tabular-nums text-foreground">{num(r.total)}</td>
                    <td className="px-2 text-right text-sm tabular-nums text-muted-foreground">{r.days > 0 ? num(Math.round(r.total / r.days)) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              แสดง {num(shown.length)} คน · กรอบสีเข้มที่หัวคอลัมน์ = วันล่าสุดที่มีข้อมูล · หัวคอลัมน์สีเทา = เสาร์-อาทิตย์
            </span>
            {view.inactive.length > 0 && (
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {showInactive ? "ซ่อนคนที่ไม่มีบันทึก" : `แสดงคนที่ไม่มีบันทึกในช่วงนี้อีก ${num(view.inactive.length)} คน`}
              </button>
            )}
          </div>
        </>
      )}
    </ChartCard>
  )
}
