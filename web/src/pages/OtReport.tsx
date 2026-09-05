import { lazy, Suspense, useMemo, useState } from "react"
import { CalendarClock, Download, PackageCheck, Timer, Users } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { OtDataNotice } from "@/components/ot/OtDataNotice"
import {
  ARRIVAL_STATUS_LABEL,
  arrivalStatus,
  calculateWorkedHours,
  collectOtRecords,
  datasetHasTimeData,
  getOtSummary,
  OT_STATUS_LABEL,
  OT_TYPE_LABEL,
  type OtApprovalStatus,
  type OtRecord,
  type OtType,
} from "@/lib/ot"
import { ALL_DEPARTMENTS, availableDepartments, buildDepartmentEmployees } from "@/lib/dashboard-selectors"
import { otRecordKey, useOtApprovals } from "@/lib/otApprovals"
import { useOtConfig } from "@/lib/settingsContext"
import { downloadCsv } from "@/lib/csv"
import { formatMonthLabel } from "@/lib/format"

const OtReportCharts = lazy(() => import("@/components/ot/OtReportCharts").then((m) => ({ default: m.OtReportCharts })))

const OT_TYPES: OtType[] = ["OT_AFTER_WORK", "OT_ON_DAY_OFF", "WORKED_ON_DAY_OFF"]
const OT_STATUSES: OtApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED"]

export function OtReport({ defaultDepartment }: { defaultDepartment?: string } = {}) {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const otConfig = useOtConfig()
  const approvals = useOtApprovals()
  const [month, setMonth] = useState("all")
  const [department, setDepartment] = useState(defaultDepartment ?? ALL_DEPARTMENTS)
  const [employee, setEmployee] = useState("all")
  const [otType, setOtType] = useState<OtType | "all">("all")
  const [status, setStatus] = useState<OtApprovalStatus | "all">("all")

  const availableMonths = useMemo(
    () => (data ? [...new Set(data.dates.map((d) => d.slice(0, 7)))].sort() : []),
    [data]
  )
  const deptEmployees = useMemo(() => (data ? buildDepartmentEmployees(data) : []), [data])
  const departments = useMemo(() => availableDepartments(deptEmployees), [deptEmployees])

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const hasTime = datasetHasTimeData(deptEmployees)
  const scopedEmployees = department === ALL_DEPARTMENTS
    ? deptEmployees
    : deptEmployees.filter((e) => e.department === department)
  const deptByName = new Map(scopedEmployees.map((e) => [e.name, e.department]))
  // Every day that recorded a clock time — including days with no overtime — so the
  // exported report is a complete work-day record. OT charts/cards below use OT days only.
  const all = collectOtRecords(scopedEmployees, otConfig, undefined, { includeZeroOt: true })
  const employeeNames = [...new Set(all.map((r) => r.employeeName))].sort()

  /** Local approval decision for a record (days without OT are not approvable). */
  const effStatus = (r: OtRecord): OtApprovalStatus =>
    approvals[otRecordKey(r.date, r.employeeName)] ?? "PENDING"

  const records = all.filter(
    (r) =>
      (month === "all" || r.date.startsWith(month)) &&
      (employee === "all" || r.employeeName === employee) &&
      (otType === "all" || r.otType === otType) &&
      // A status filter only applies to days that actually have OT.
      (status === "all" || (r.otHours > 0 && effStatus(r) === status))
  )
  const otRecords = records.filter((r) => r.otHours > 0)
  const summary = getOtSummary(otRecords)

  /** Net worked hours for a record, from its own clock times. */
  const workedHoursOf = (r: OtRecord) =>
    calculateWorkedHours({ parcels: r.parcels, items: r.items, checkIn: r.checkIn, checkOut: r.checkOut }, otConfig)

  const handleExport = () => {
    downloadCsv(
      `ot-report_${department === ALL_DEPARTMENTS ? "all" : department}_${month}_${employee}.csv`,
      ["วันที่", "พนักงาน", "ฝ่าย", "ประเภทวัน", "เวลาเริ่ม", "เวลาเลิก", "สถานะเข้างาน", "ชม.ทำงาน", "ประเภท OT", "ชั่วโมง OT", "พัสดุ", "สินค้า", "สถานะ"],
      records.map((r) => {
        const worked = workedHoursOf(r)
        return [
          r.date,
          r.employeeName,
          deptByName.get(r.employeeName) ?? r.department,
          r.workStatus,
          r.checkIn ?? "",
          r.checkOut ?? "",
          ARRIVAL_STATUS_LABEL[arrivalStatus(r.checkIn, otConfig)],
          worked === null ? "" : worked.toFixed(2),
          OT_TYPE_LABEL[r.otType],
          r.otHours.toFixed(2),
          r.parcels ?? 0,
          r.items ?? 0,
          r.otHours > 0 ? OT_STATUS_LABEL[effStatus(r)] : "ไม่มี OT",
        ]
      })
    )
  }

  const selectCls = "rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"

  return (
    <div className="space-y-4">
      {!hasTime && <OtDataNotice />}

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground">เดือน</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทุกเดือน</option>
            {availableMonths.map((m) => (
              <option key={m} value={m} className="bg-popover text-popover-foreground">{formatMonthLabel(m)}</option>
            ))}
          </select>
        </div>
        {departments.length > 1 && (
          <div>
            <label className="block text-[11px] text-muted-foreground">ฝ่าย</label>
            <select value={department} onChange={(e) => { setDepartment(e.target.value); setEmployee("all") }} className={selectCls + " font-semibold"}>
              <option value={ALL_DEPARTMENTS} className="bg-popover text-popover-foreground">ทุกฝ่าย</option>
              {departments.map((d) => (
                <option key={d} value={d} className="bg-popover text-popover-foreground">{d}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[11px] text-muted-foreground">พนักงาน</label>
          <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {employeeNames.map((n) => (
              <option key={n} value={n} className="bg-popover text-popover-foreground">{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground">ประเภท OT</label>
          <select value={otType} onChange={(e) => setOtType(e.target.value as OtType | "all")} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {OT_TYPES.map((t) => (
              <option key={t} value={t} className="bg-popover text-popover-foreground">{OT_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground">สถานะ</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as OtApprovalStatus | "all")} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {OT_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{OT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto text-right">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="size-4" /> Export CSV
          </Button>
          <p className="mt-1 text-[11px] text-muted-foreground">
            ส่งออก {records.length} วันทำงาน (มี OT {otRecords.length} วัน)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="ชั่วโมง OT รวม" value={summary.totalHours} icon={Timer} gradient="bg-gradient-to-br from-brand-500 to-brand-700" formatValue={(n) => n.toFixed(1)} suffix="ชม." />
        <KpiCard title="งานช่วง OT (พัสดุ)" value={summary.totalParcels} icon={PackageCheck} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="พัสดุ" />
        <KpiCard title="จำนวนพนักงาน" value={summary.employeeCount} icon={Users} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="คน" />
        <KpiCard title="วันที่ทำ OT" value={summary.dayCount} icon={CalendarClock} gradient="bg-gradient-to-br from-amber-500 to-rose-500" suffix="วัน" />
      </div>

      {otRecords.length > 0 ? (
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          <OtReportCharts records={otRecords} />
        </Suspense>
      ) : (
        <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {hasTime ? "ไม่มีรายการ OT ตามเงื่อนไขที่เลือก" : "ยังไม่มีข้อมูลเวลาเข้า-ออกงานในระบบ"}
        </div>
      )}
    </div>
  )
}
