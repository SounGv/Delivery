import { useMemo, useState } from "react"
import { CalendarClock, Check, CheckCheck, Clock, FileText, PackageCheck, RotateCcw, Timer, Users, X } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OtSlipModal } from "@/components/ot/OtSlipModal"
import { OtDataNotice } from "@/components/ot/OtDataNotice"
import {
  collectOtRecords,
  datasetHasTimeData,
  getOtSummary,
  OT_STATUS_LABEL,
  OT_TYPE_LABEL,
  type OtApprovalStatus,
  type OtRecord,
} from "@/lib/ot"
import { ALL_DEPARTMENTS, RW_DEPARTMENTS, availableDepartments, buildDepartmentEmployees } from "@/lib/dashboard-selectors"
import { otRecordKey, setOtDecision, setOtDecisionMany, useOtApprovals } from "@/lib/otApprovals"
import { useOtConfig } from "@/lib/settingsContext"
import { formatMonthLabel } from "@/lib/format"

export function OtManagement({ defaultDepartment }: { defaultDepartment?: string } = {}) {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const otConfig = useOtConfig()
  const approvals = useOtApprovals()
  const [selectedMonth, setSelectedMonth] = useState("")
  const [department, setDepartment] = useState(defaultDepartment ?? ALL_DEPARTMENTS)
  const [employee, setEmployee] = useState("all")
  const [slip, setSlip] = useState<OtRecord | null>(null)

  const availableMonths = useMemo(
    () => (data ? [...new Set(data.dates.map((d) => d.slice(0, 7)))].sort() : []),
    [data]
  )
  const deptEmployees = useMemo(() => (data ? buildDepartmentEmployees(data) : []), [data])
  const departments = useMemo(() => availableDepartments(deptEmployees), [deptEmployees])

  if (isLoading) return <LoadingSkeletonGrid count={6} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const hasTime = datasetHasTimeData(deptEmployees)
  const currentMonth = data.todayDate.slice(0, 7)
  const activeMonth = selectedMonth || currentMonth

  const scopedEmployees = department === ALL_DEPARTMENTS
    ? deptEmployees
    : deptEmployees.filter((e) => e.department === department)
  const deptByName = new Map(scopedEmployees.map((e) => [e.name, e.department]))

  const monthStart = `${activeMonth}-01`
  const monthEnd = `${activeMonth}-31`
  // The TABLE lists every day with a recorded clock time (OT 0.00 when the person left
  // by the normal end hour) so it matches Work & Attendance day-for-day. The OT KPI
  // cards and approvals below use only the days that actually produced overtime.
  const allRecords = collectOtRecords(scopedEmployees, otConfig, { start: monthStart, end: monthEnd }, { includeZeroOt: true })
  const records = employee === "all" ? allRecords : allRecords.filter((r) => r.employeeName === employee)
  const otRecords = records.filter((r) => r.otHours > 0)

  const monthSummary = getOtSummary(otRecords)
  const monthAllSummary = getOtSummary(allRecords.filter((r) => r.otHours > 0))
  const todaySummary = getOtSummary(collectOtRecords(scopedEmployees, otConfig, { start: data.todayDate, end: data.todayDate }))

  const employeeNames = [...new Set(allRecords.map((r) => r.employeeName))].sort()

  // Layer the local approval decisions over the sheet-derived records. Only days with
  // actual overtime are approvable, so the counts ignore the zero-OT rows.
  const effStatus = (r: OtRecord): OtApprovalStatus =>
    approvals[otRecordKey(r.date, r.employeeName)] ?? "PENDING"
  const pendingCount = otRecords.filter((r) => effStatus(r) === "PENDING").length
  const approvedCount = otRecords.filter((r) => effStatus(r) === "APPROVED").length
  const noOtCount = records.length - otRecords.length
  const pendingKeys = otRecords
    .filter((r) => effStatus(r) === "PENDING")
    .map((r) => otRecordKey(r.date, r.employeeName))

  const statusVariant: Record<OtApprovalStatus, "outline" | "default" | "destructive"> = {
    PENDING: "outline",
    APPROVED: "default",
    REJECTED: "destructive",
  }

  return (
    <div className="space-y-4">
      {!hasTime && <OtDataNotice />}

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground" htmlFor="ot-month">เดือน</label>
          <select
            id="ot-month"
            value={activeMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm font-semibold text-foreground outline-none"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m} className="bg-popover text-popover-foreground">
                {formatMonthLabel(m)}{m === currentMonth ? " (เดือนนี้)" : ""}
              </option>
            ))}
          </select>
        </div>
        {departments.length > 1 && (
          <div>
            <label className="block text-[11px] text-muted-foreground" htmlFor="ot-dept">ฝ่าย</label>
            <select
              id="ot-dept"
              value={department}
              onChange={(e) => { setDepartment(e.target.value); setEmployee("all") }}
              className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm font-semibold text-foreground outline-none"
            >
              <option value={ALL_DEPARTMENTS} className="bg-popover text-popover-foreground">ทุกฝ่าย</option>
              {departments.map((d) => (
                <option key={d} value={d} className="bg-popover text-popover-foreground">{d}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[11px] text-muted-foreground" htmlFor="ot-emp">พนักงาน</label>
          <select
            id="ot-emp"
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
          >
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {employeeNames.map((n) => (
              <option key={n} value={n} className="bg-popover text-popover-foreground">{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="OT วันนี้" value={todaySummary.totalHours} icon={Clock} gradient="bg-gradient-to-br from-brand-500 to-brand-700" formatValue={(n) => n.toFixed(1)} suffix="ชม." />
        <KpiCard title="OT เดือนนี้" value={monthAllSummary.totalHours} icon={CalendarClock} gradient="bg-gradient-to-br from-violet-500 to-brand-600" formatValue={(n) => n.toFixed(1)} suffix="ชม." />
        <KpiCard title="ชั่วโมง OT รวม" value={monthSummary.totalHours} icon={Timer} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" formatValue={(n) => n.toFixed(1)} suffix="ชม." />
        <KpiCard title="พนักงาน OT" value={monthSummary.employeeCount} icon={Users} gradient="bg-gradient-to-br from-amber-500 to-amber-600" suffix="คน" />
        <KpiCard title="งานช่วง OT (พัสดุ)" value={monthSummary.totalParcels} icon={PackageCheck} gradient="bg-gradient-to-br from-brand-400 to-brand-600" suffix="พัสดุ" />
        <KpiCard title="รออนุมัติ" value={pendingCount} icon={FileText} gradient="bg-gradient-to-br from-rose-500 to-destructive" suffix="รายการ" />
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            รายการ OT — {formatMonthLabel(activeMonth)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              อนุมัติแล้ว {approvedCount} · รออนุมัติ {pendingCount}
              {noOtCount > 0 && <> · ไม่มี OT {noOtCount} วัน</>}
            </span>
          </h3>
          {pendingKeys.length > 0 && (
            <Button size="xs" variant="default" onClick={() => setOtDecisionMany(pendingKeys, "APPROVED")}>
              <CheckCheck className="size-3" /> อนุมัติทั้งหมด ({pendingKeys.length})
            </Button>
          )}
        </div>
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">วันที่</th>
              <th className="pb-2 font-medium">พนักงาน</th>
              <th className="pb-2 font-medium">แผนก</th>
              <th className="pb-2 font-medium">ประเภทวัน</th>
              <th className="pb-2 font-medium">เวลาเริ่ม</th>
              <th className="pb-2 font-medium">เวลาเลิก</th>
              <th className="pb-2 font-medium">ประเภท OT</th>
              <th className="pb-2 font-medium">ชั่วโมง OT</th>
              <th className="pb-2 font-medium">งานที่ทำ</th>
              <th className="pb-2 font-medium">สถานะ</th>
              <th className="pb-2 font-medium">ใบ OT</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={`${r.date}-${r.employeeName}-${i}`} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-foreground">{r.date}</td>
                <td className="py-2 text-foreground">{r.employeeName}</td>
                <td className="py-2 text-muted-foreground">{deptByName.get(r.employeeName) ?? r.department}</td>
                <td className="py-2 text-muted-foreground">{r.workStatus}</td>
                <td className="py-2 text-muted-foreground">{r.checkIn ?? "-"}</td>
                <td className="py-2 text-muted-foreground">{r.checkOut ?? "-"}</td>
                <td className="py-2 text-muted-foreground">{OT_TYPE_LABEL[r.otType]}</td>
                <td className="py-2 font-semibold text-foreground">{r.otHours.toFixed(2)}</td>
                <td className="py-2 text-muted-foreground">
                  {r.parcels ?? 0} พัสดุ · {r.items ?? 0} ชิ้น
                  {RW_DEPARTMENTS.has(deptByName.get(r.employeeName) ?? "") && (
                    <span className="mt-0.5 block text-[11px] text-brand-400">หมายเหตุ: ไปช่วยงานฝ่ายออนไลน์</span>
                  )}
                </td>
                <td className="py-2">
                  {r.otHours <= 0 ? (
                    <span className="text-xs text-muted-foreground">ไม่มี OT</span>
                  ) : (() => {
                    const key = otRecordKey(r.date, r.employeeName)
                    const status = effStatus(r)
                    return (
                      <div className="flex items-center gap-1.5">
                        <Badge variant={statusVariant[status]}>{OT_STATUS_LABEL[status]}</Badge>
                        {status === "PENDING" ? (
                          <>
                            <Button size="xs" variant="default" onClick={() => setOtDecision(key, "APPROVED")} title="อนุมัติ">
                              <Check className="size-3" /> อนุมัติ
                            </Button>
                            <Button size="xs" variant="destructive" onClick={() => setOtDecision(key, "REJECTED")} title="ไม่อนุมัติ">
                              <X className="size-3" />
                            </Button>
                          </>
                        ) : (
                          <Button size="xs" variant="ghost" onClick={() => setOtDecision(key, null)} title="ยกเลิกการตัดสิน">
                            <RotateCcw className="size-3" /> แก้ไข
                          </Button>
                        )}
                      </div>
                    )
                  })()}
                </td>
                <td className="py-2">
                  {r.otHours > 0 && (
                    <Button size="xs" variant="outline" onClick={() => setSlip(r)}>
                      <FileText className="size-3" /> ดูใบ OT
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-muted-foreground">
                  {hasTime ? "ไม่มีบันทึกเวลาในเดือนนี้" : "ยังไม่มีข้อมูลเวลาเข้า-ออกงานในระบบ"}
                </td>
              </tr>
            )}
          </tbody>
          {records.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-semibold text-foreground">
                <td className="pt-2" colSpan={7}>รวม ({records.length} วัน · มี OT {monthSummary.recordCount} วัน)</td>
                <td className="pt-2">{monthSummary.totalHours.toFixed(2)}</td>
                <td className="pt-2">{monthSummary.totalParcels} พัสดุ · {monthSummary.totalItems} ชิ้น</td>
                <td className="pt-2" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">
        ตารางนี้แสดง<strong>ทุกวันที่ลงเวลาไว้ในชีต</strong> — วันที่ออกงานไม่เกิน {otConfig.workEndHour}:00 จะขึ้น OT 0.00 และกำกับว่า "ไม่มี OT" (อนุมัติเฉพาะวันที่มี OT) · OT คำนวณจากเวลาออกงานจริงเทียบเวลาเลิกงานปกติ ({otConfig.workEndHour}:00) · นับเฉพาะชั่วโมงและงานที่ทำ ไม่คิดเป็นเงิน · เข้าก่อนเวลาไม่นับเป็น OT · สถานะอนุมัติถูกบันทึกในเบราว์เซอร์นี้ (ชีทเป็นแบบอ่านอย่างเดียว จึงเขียนกลับไม่ได้)
      </p>

      {slip && <OtSlipModal record={slip} onClose={() => setSlip(null)} />}
    </div>
  )
}
