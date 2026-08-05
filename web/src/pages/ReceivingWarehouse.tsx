import { useMemo, useState } from "react"
import { PackageOpen, Warehouse } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Badge } from "@/components/ui/badge"
import { formatDateLabel } from "@/lib/format"
import type { RwDepartment } from "@/api/types"

/** Dates (across all staff + metrics) that actually carry a value, newest first. */
function datesWithData(dep: RwDepartment[]): string[] {
  const set = new Set<string>()
  for (const d of dep) {
    for (const cat of d.staffCategories) {
      for (const e of cat.employees) {
        for (const [date, v] of Object.entries(e.byDate)) {
          if (v.value1 != null || v.value2 != null || v.checkIn || v.checkOut) set.add(date)
        }
      }
    }
    for (const m of d.metrics) {
      for (const [date, text] of Object.entries(m.byDate)) if (text?.trim()) set.add(date)
    }
  }
  return [...set].sort().reverse()
}

const num = (n: number | null) => (n == null ? "-" : n.toLocaleString("th-TH"))

export function ReceivingWarehouse() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const rw = data?.receivingWarehouse ?? null

  const activeDates = useMemo(() => (rw ? datesWithData(rw.departments) : []), [rw])
  const [date, setDate] = useState<string>("")
  const activeDate = date || activeDates[0] || ""

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  if (!rw || rw.departments.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
        ยังไม่มีข้อมูลฝ่ายรับเข้า/ฝ่ายคลัง — ตรวจว่าได้ redeploy Apps Script (เวอร์ชันที่อ่านแท็บ "ตารางงาน … รับเข้า+คลัง") แล้วหรือยัง
      </div>
    )
  }

  const deptIcon = (title: string) => (title.indexOf("คลัง") !== -1 ? Warehouse : PackageOpen)

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground">วันที่</label>
          <select
            value={activeDate}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm font-semibold text-foreground outline-none"
          >
            {activeDates.map((d) => (
              <option key={d} value={d} className="bg-popover text-popover-foreground">
                {formatDateLabel(d)}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          ข้อมูลฝ่ายรับเข้า + ฝ่ายคลัง (จากแท็บ "รับเข้า+คลัง") · แสดงค่ารายบุคคลของวันที่เลือก และ KPI รวมฝ่าย (ค่าล่าสุด)
        </p>
      </div>

      {rw.departments.map((dep) => {
        const Icon = deptIcon(dep.title)
        return (
          <div key={dep.title} className="space-y-3">
            <h2 className="flex items-center gap-2 px-1 text-base font-semibold text-foreground">
              <Icon className="size-5 text-brand-400" /> {dep.title}
            </h2>

            {dep.staffCategories.map((cat) => (
              <div key={cat.id} className="glass-panel overflow-x-auto rounded-2xl p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {cat.id}. {cat.title}
                  {cat.target && <span className="ml-2 text-xs font-normal text-muted-foreground">เป้า: {cat.target}</span>}
                </h3>
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">ชื่อ</th>
                      <th className="pb-2 font-medium">ค่าที่ 1 (SKU/บิล)</th>
                      <th className="pb-2 font-medium">ค่าที่ 2 (จำนวนชิ้น)</th>
                      <th className="pb-2 font-medium">เวลาเข้า</th>
                      <th className="pb-2 font-medium">เวลาออก</th>
                      <th className="pb-2 font-medium">รวมเดือน (1 · 2)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.employees.map((e) => {
                      const v = e.byDate[activeDate]
                      return (
                        <tr key={e.name} className="border-b border-white/5 last:border-0">
                          <td className="py-2 text-foreground">{e.name}</td>
                          <td className="py-2 tabular-nums text-foreground">{num(v?.value1 ?? null)}</td>
                          <td className="py-2 tabular-nums text-foreground">{num(v?.value2 ?? null)}</td>
                          <td className="py-2 text-muted-foreground">{v?.checkIn ?? "-"}</td>
                          <td className="py-2 text-muted-foreground">{v?.checkOut ?? "-"}</td>
                          <td className="py-2 tabular-nums text-muted-foreground">
                            {num(e.totalValue1)} · {num(e.totalValue2)}
                          </td>
                        </tr>
                      )
                    })}
                    {cat.employees.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">ยังไม่มีรายชื่อ</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}

            {dep.metrics.length > 0 && (
              <div className="glass-panel overflow-x-auto rounded-2xl p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">KPI รวมฝ่าย</h3>
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">KPI</th>
                      <th className="pb-2 font-medium">เป้าหมาย</th>
                      <th className="pb-2 font-medium">ค่าล่าสุด</th>
                      <th className="pb-2 font-medium">วันที่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dep.metrics.map((m) => {
                      const dks = Object.keys(m.byDate).filter((d) => m.byDate[d]?.trim()).sort()
                      const latest = dks[dks.length - 1]
                      return (
                        <tr key={m.id || m.title} className="border-b border-white/5 last:border-0">
                          <td className="py-2 text-foreground">
                            {m.id && `${m.id}. `}{m.title}
                          </td>
                          <td className="py-2 text-muted-foreground">{m.target || "-"}</td>
                          <td className="py-2 text-foreground">
                            {latest ? <Badge variant="outline">{m.byDate[latest]}</Badge> : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="py-2 text-muted-foreground">{latest ? formatDateLabel(latest) : "-"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
