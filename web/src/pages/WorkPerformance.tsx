import { useMemo, useState } from "react"
import { AlertTriangle, Boxes, Download, PackageCheck, ScanLine, Truck, Users } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { downloadCsv } from "@/lib/csv"
import { cn } from "@/lib/utils"
import type { WorkPerformanceEmployee } from "@/api/types"

const DEPARTMENT_ORDER = ["ออนไลน์", "ออฟไลน์", "คลัง", "แอดมิน"]

function sumMetric(emp: WorkPerformanceEmployee, key: keyof WorkPerformanceEmployee["totals"]): number {
  return emp.totals[key] ?? 0
}

/**
 * "ผลงาน (BigSeller)" — per-employee daily fulfilment performance pulled
 * on-demand from BigSeller's own "รายงานผลการทำงาน" report, replacing the old
 * manual per-person entry. Deliberately a SEPARATE page/data source from every
 * other employee page — see WorkPerformance in api/types.ts for why. Ingestion
 * is manual: someone (Claude, on request) logs into BigSeller, exports the
 * report, and pastes it into the "ผลงานพนักงาน (BigSeller)" sheet tab; there is
 * no scheduled sync.
 */
export function WorkPerformance() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const [department, setDepartment] = useState("all")

  const wp = data?.workPerformance ?? null

  const departments = useMemo(() => {
    if (!wp) return []
    const present = new Set(wp.employees.map((e) => e.department))
    const ordered = DEPARTMENT_ORDER.filter((d) => present.has(d))
    const extra = [...present].filter((d) => !DEPARTMENT_ORDER.includes(d)).sort()
    return [...ordered, ...extra]
  }, [wp])

  const filtered = useMemo(() => {
    if (!wp) return []
    const rows = department === "all" ? wp.employees : wp.employees.filter((e) => e.department === department)
    return [...rows].sort((a, b) => sumMetric(b, "pickParcels") - sumMetric(a, "pickParcels"))
  }, [wp, department])

  const grouped = useMemo(() => {
    const map = new Map<string, WorkPerformanceEmployee[]>()
    for (const emp of filtered) {
      const list = map.get(emp.department) ?? []
      list.push(emp)
      map.set(emp.department, list)
    }
    const order = department === "all" ? departments : [department]
    return order.filter((d) => map.has(d)).map((d) => ({ department: d, employees: map.get(d)! }))
  }, [filtered, department, departments])

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  if (!wp) {
    return (
      <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div className="text-sm">
          <p className="font-semibold text-foreground">ยังไม่พบข้อมูลผลงานพนักงานจาก BigSeller</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ต้องมีทั้งชีต "ผลงานพนักงาน (BigSeller)" และ "รายชื่อพนักงาน (BigSeller)" ก่อน — แจ้งให้ดึงข้อมูลจาก BigSeller มาใส่ชีตได้เลย
          </p>
        </div>
      </div>
    )
  }

  const totalPick = wp.employees.reduce((s, e) => s + sumMetric(e, "pickParcels"), 0)
  const totalSort = wp.employees.reduce((s, e) => s + sumMetric(e, "sortParcels"), 0)
  const totalPack = wp.employees.reduce((s, e) => s + sumMetric(e, "packParcels"), 0)
  const totalShip = wp.employees.reduce((s, e) => s + sumMetric(e, "ship"), 0)

  const handleExport = () => {
    downloadCsv(
      `bigseller-work-performance_${department}.csv`,
      ["วันที่", "โอเปอเรเตอร์", "ชื่อ", "แผนก", "จัดการคำสั่งซื้อ", "พิมพ์ใบปะหน้า", "PDA หยิบของ", "จัดส่ง", "จำนวนรวมพัสดุที่หยิบ", "จำนวนรวมพัสดุที่คัดแยก", "จำนวนรวมพัสดุที่แพ็ก", "จำนวนพัสดุที่ตรวจสอบ"],
      filtered.flatMap((emp) =>
        wp.dates
          .filter((d) => emp.byDate[d])
          .map((d) => {
            const m = emp.byDate[d]!
            return [
              d,
              emp.operator,
              emp.name,
              emp.department,
              m.manageOrders,
              m.printLabel,
              m.pdaPick,
              m.ship,
              m.pickParcels,
              m.sortParcels,
              m.packParcels,
              m.inspectParcels,
            ]
          })
      )
    )
  }

  return (
    <div className="space-y-4">
      {wp.unmapped.length > 0 && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">พบบัญชี BigSeller ที่ยังไม่มีชื่อ/แผนก</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {wp.unmapped.join(", ")} — เพิ่มชื่อและแผนกในชีต "รายชื่อพนักงาน (BigSeller)" เพื่อให้แสดงผลครบ
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="พนักงานทั้งหมด" value={wp.employees.length} icon={Users} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="คน" />
        <KpiCard title="พัสดุที่หยิบรวม" value={totalPick} icon={ScanLine} gradient="bg-gradient-to-br from-sky-500 to-sky-700" suffix="ชิ้น" />
        <KpiCard title="พัสดุที่คัดแยกรวม" value={totalSort} icon={Boxes} gradient="bg-gradient-to-br from-amber-500 to-amber-600" suffix="ชิ้น" />
        <KpiCard title="พัสดุที่แพ็กรวม" value={totalPack} icon={PackageCheck} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="ชิ้น" />
      </div>

      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border p-1">
          <button
            type="button"
            onClick={() => setDepartment("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              department === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            ทั้งหมด
          </button>
          {departments.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepartment(d)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                department === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Truck className="size-3.5" /> จัดส่งรวม {totalShip.toLocaleString("th-TH")}
          </span>
          <span>ช่วงวันที่: {wp.dates[0]} – {wp.dates[wp.dates.length - 1]}</span>
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Download className="size-4" /> Export CSV
          </button>
        </div>
      </div>

      {grouped.map((g) => (
        <div key={g.department} className="glass-panel overflow-x-auto rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            ฝ่าย{g.department} <span className="text-xs font-normal text-muted-foreground">({g.employees.length} คน)</span>
          </h3>
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-2 font-medium">ชื่อ</th>
                <th className="pb-2 font-medium">Username (BigSeller)</th>
                <th className="pb-2 text-right font-medium">หยิบ (พัสดุ)</th>
                <th className="pb-2 text-right font-medium">คัดแยก (พัสดุ)</th>
                <th className="pb-2 text-right font-medium">แพ็ก (พัสดุ)</th>
                <th className="pb-2 text-right font-medium">ตรวจสอบ (พัสดุ)</th>
                <th className="pb-2 text-right font-medium">จัดส่ง</th>
              </tr>
            </thead>
            <tbody>
              {g.employees.map((emp) => (
                <tr key={emp.operator} className="border-b border-white/5 last:border-0">
                  <td className="py-2 font-medium text-foreground">{emp.name}</td>
                  <td className="py-2 text-muted-foreground">{emp.operator}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, "pickParcels").toLocaleString("th-TH")}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, "sortParcels").toLocaleString("th-TH")}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, "packParcels").toLocaleString("th-TH")}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, "inspectParcels").toLocaleString("th-TH")}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, "ship").toLocaleString("th-TH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
