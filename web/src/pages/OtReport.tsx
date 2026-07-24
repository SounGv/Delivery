import { lazy, Suspense, useMemo, useState } from "react"
import { CalendarClock, Download, PackageCheck, Timer, Users } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { OtDataNotice } from "@/components/ot/OtDataNotice"
import {
  ARRIVAL_STATUS_LABEL,
  arrivalStatus,
  collectOtRecords,
  datasetHasTimeData,
  getOtSummary,
  OT_STATUS_LABEL,
  OT_TYPE_LABEL,
  type OtApprovalStatus,
  type OtType,
} from "@/lib/ot"
import { useOtConfig } from "@/lib/settingsContext"
import { downloadCsv } from "@/lib/csv"
import { formatMonthLabel } from "@/lib/format"

const OtReportCharts = lazy(() => import("@/components/ot/OtReportCharts").then((m) => ({ default: m.OtReportCharts })))

const OT_TYPES: OtType[] = ["OT_AFTER_WORK", "OT_ON_DAY_OFF", "WORKED_ON_DAY_OFF"]
const OT_STATUSES: OtApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED"]

export function OtReport() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const otConfig = useOtConfig()
  const [month, setMonth] = useState("all")
  const [employee, setEmployee] = useState("all")
  const [otType, setOtType] = useState<OtType | "all">("all")
  const [status, setStatus] = useState<OtApprovalStatus | "all">("all")

  const availableMonths = useMemo(
    () => (data ? [...new Set(data.dates.map((d) => d.slice(0, 7)))].sort() : []),
    [data]
  )

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const hasTime = datasetHasTimeData(data.employees)
  const all = collectOtRecords(data.employees, otConfig)
  const employeeNames = [...new Set(all.map((r) => r.employeeName))].sort()

  const records = all.filter(
    (r) =>
      (month === "all" || r.date.startsWith(month)) &&
      (employee === "all" || r.employeeName === employee) &&
      (otType === "all" || r.otType === otType) &&
      (status === "all" || r.status === status)
  )
  const summary = getOtSummary(records)

  const handleExport = () => {
    downloadCsv(
      `ot-report_${month}_${employee}.csv`,
      ["วันที่", "พนักงาน", "แผนก", "ประเภทวัน", "เวลาเริ่ม", "เวลาเลิก", "สถานะเข้างาน", "ประเภท OT", "ชั่วโมง OT", "พัสดุ", "สินค้า", "สถานะ"],
      records.map((r) => [r.date, r.employeeName, r.department, r.workStatus, r.checkIn ?? "", r.checkOut ?? "", ARRIVAL_STATUS_LABEL[arrivalStatus(r.checkIn, otConfig)], OT_TYPE_LABEL[r.otType], r.otHours.toFixed(2), r.parcels ?? 0, r.items ?? 0, OT_STATUS_LABEL[r.status]])
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
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="ชั่วโมง OT รวม" value={summary.totalHours} icon={Timer} gradient="bg-gradient-to-br from-brand-500 to-brand-700" formatValue={(n) => n.toFixed(1)} suffix="ชม." />
        <KpiCard title="งานช่วง OT (พัสดุ)" value={summary.totalParcels} icon={PackageCheck} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="พัสดุ" />
        <KpiCard title="จำนวนพนักงาน" value={summary.employeeCount} icon={Users} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="คน" />
        <KpiCard title="วันที่ทำ OT" value={summary.dayCount} icon={CalendarClock} gradient="bg-gradient-to-br from-amber-500 to-rose-500" suffix="วัน" />
      </div>

      {records.length > 0 ? (
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          <OtReportCharts records={records} />
        </Suspense>
      ) : (
        <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {hasTime ? "ไม่มีรายการ OT ตามเงื่อนไขที่เลือก" : "ยังไม่มีข้อมูลเวลาเข้า-ออกงานในระบบ"}
        </div>
      )}
    </div>
  )
}
