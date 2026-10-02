import { useMemo, useState } from "react"
import type { Category, DashboardResponse } from "@/api/types"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { ExportButton } from "@/components/common/ExportButton"
import { SectionCard } from "@/components/layout/SectionCard"
import { getDatePresets } from "@/lib/dashboard-selectors"
import { allCategoriesReport, categoryReport } from "@/lib/reportExports"
import { formatFullDateLabel } from "@/lib/format"

const ALL = "__all__"

/** How many (item × date) cells in `category` actually hold a value inside `dates`. */
function filledCells(category: Category, dates: string[]): number {
  let n = 0
  for (const row of category.rows) for (const d of dates) if (row.byDate[d] !== undefined && row.byDate[d] !== "") n += 1
  return n
}

/** Pull a report for one KPI category (ความผิดพลาด, CN/ตีกลับ, ...) or for all of them, over any
 * date range, straight from the sheet's category blocks — previewed here, saved as CSV. */
export function CategoryReportPanel({ data }: { data: DashboardResponse }) {
  const [categoryTitle, setCategoryTitle] = useState(ALL)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Monthly tabs pre-create every calendar day, so cap the selectable range at the latest day with data.
  const sortedDates = useMemo(() => [...data.dates].sort().filter((d) => d <= data.todayDate), [data])
  const minDate = sortedDates[0] ?? data.todayDate
  const maxDate = sortedDates[sortedDates.length - 1] ?? data.todayDate
  const defaultRange = useMemo(() => {
    // 30 days rather than "this month": early in a month that would be only a day or two of data.
    const preset = getDatePresets(maxDate, minDate).find((p) => p.label === "30 วันล่าสุด")
    return preset ?? { start: minDate, end: maxDate }
  }, [minDate, maxDate])
  const start = startDate || defaultRange.start
  const end = endDate || defaultRange.end
  const dates = useMemo(() => sortedDates.filter((d) => d >= start && d <= end), [sortedDates, start, end])

  const categories = data.categories
  const selected = categoryTitle === ALL ? null : categories.find((c) => c.title === categoryTitle) ?? null

  const selectCls =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm outline-none hover:bg-muted"

  return (
    <SectionCard
      emoji="🗂️"
      title="ดึงรายงานตามหมวดหมู่"
      subtitle="เลือกหมวดหมู่ KPI กับช่วงวันที่ ดูตัวอย่างก่อน แล้วโหลดเป็นไฟล์ CSV (เปิดใน Excel ได้)"
      actions={
        <ExportButton
          disabled={dates.length === 0 || categories.length === 0}
          label={selected ? "ส่งออกหมวดนี้" : "ส่งออกทุกหมวด"}
          build={() => (selected ? categoryReport(selected, dates) : allCategoriesReport(categories, dates))}
        />
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">หมวดหมู่</label>
          <select value={categoryTitle} onChange={(e) => setCategoryTitle(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทุกหมวดหมู่ ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.title} className="bg-popover text-popover-foreground">
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">ช่วงวันที่</label>
          <DateRangePicker
            start={start}
            end={end}
            minDate={minDate}
            maxDate={maxDate}
            today={data.todayDate}
            onChange={({ start: s, end: e }) => {
              setStartDate(s)
              setEndDate(e)
            }}
          />
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          {formatFullDateLabel(start)} – {formatFullDateLabel(end)} · {dates.length} วันที่มีข้อมูล
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีหมวดหมู่ในชีต</p>
      ) : selected ? (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                <th className="sticky left-0 bg-muted px-3 py-2 font-bold">รายการ</th>
                {dates.map((d) => (
                  <th key={d} className="px-2 py-2 text-center font-bold whitespace-nowrap">
                    {d.slice(8)}/{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selected.rows.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <td className="sticky left-0 bg-card px-3 py-2 font-semibold text-foreground whitespace-nowrap">{row.label}</td>
                  {dates.map((d) => (
                    <td key={d} className="px-2 py-2 text-center text-muted-foreground">
                      {row.byDate[d] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
              {selected.rows.length === 0 && (
                <tr>
                  <td colSpan={dates.length + 1} className="py-6 text-center text-muted-foreground">หมวดนี้ไม่มีรายการ</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryTitle(c.title)}
              className="rounded-2xl border border-l-[6px] border-border border-l-brand-400 bg-card p-3 text-left shadow-[0_4px_20px_rgba(43,168,162,0.10)] transition-transform hover:-translate-y-0.5"
            >
              <p className="truncate text-sm font-extrabold text-foreground">{c.title}</p>
              <p className="text-xs text-muted-foreground">
                {c.rows.length} รายการ · มีค่า {filledCells(c, dates).toLocaleString("th-TH")} ช่องในช่วงนี้
              </p>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
