import { useMemo, useState } from "react"
import { Boxes, CalendarCheck2, Clock, Download, Gauge, LogIn, PackageCheck, Timer, Users } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OtDataNotice } from "@/components/ot/OtDataNotice"
import {
  ARRIVAL_STATUS_LABEL,
  arrivalStatus,
  collectPartialAttendance,
  collectWorkedHours,
  datasetHasTimeData,
  getWorkedHoursSummary,
  timeToMinutes,
} from "@/lib/ot"
import { ALL_DEPARTMENTS, availableDepartments, buildDepartmentEmployees } from "@/lib/dashboard-selectors"
import { downloadReportExcel } from "@/lib/exportReportExcel"
import { useOtConfig } from "@/lib/settingsContext"
import { formatMonthLabel } from "@/lib/format"

/** `defaultDepartment` pre-selects the department filter (used when this page
 * is embedded as a tab inside a team's department page) — omit for the
 * standalone "Work & Attendance" nav entry, which still defaults to "ทุกฝ่าย". */
export function Attendance({ defaultDepartment }: { defaultDepartment?: string } = {}) {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const otConfig = useOtConfig()
  const [selectedMonth, setSelectedMonth] = useState("")
  const [department, setDepartment] = useState(defaultDepartment ?? ALL_DEPARTMENTS)
  const [employee, setEmployee] = useState("all")

  const availableMonths = useMemo(
    () => (data ? [...new Set(data.dates.map((d) => d.slice(0, 7)))].sort() : []),
    [data]
  )
  // All people across every department (ออนไลน์/ออฟไลน์/ฝ่ายรับเข้า/ฝ่ายคลัง).
  const deptEmployees = useMemo(() => (data ? buildDepartmentEmployees(data) : []), [data])
  const departments = useMemo(() => availableDepartments(deptEmployees), [deptEmployees])

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const hasTime = datasetHasTimeData(deptEmployees)
  const currentMonth = data.todayDate.slice(0, 7)
  const activeMonth = selectedMonth || currentMonth
  const workStart = otConfig.workStartHour * 60

  const scopedEmployees = department === ALL_DEPARTMENTS
    ? deptEmployees
    : deptEmployees.filter((e) => e.department === department)

  const range = { start: `${activeMonth}-01`, end: `${activeMonth}-31` }
  const all = collectWorkedHours(scopedEmployees, otConfig, range)
  const rows = employee === "all" ? all : all.filter((r) => r.employeeName === employee)
  const summary = getWorkedHoursSummary(rows)

  // Days that recorded a clock time but no usable span (e.g. check-in with no check-out)
  // are listed too, so the table matches every time entered in the sheet. Productivity
  // averages above stay based on complete days only.
  const partialAll = collectPartialAttendance(scopedEmployees, otConfig, range)
  const partialRows = employee === "all" ? partialAll : partialAll.filter((r) => r.employeeName === employee)
  const totalTimeRecords = rows.length + partialRows.length

  const employeeNames = [...new Set(scopedEmployees.map((e) => e.name))].sort()
  const deptByName = new Map(scopedEmployees.map((e) => [e.name, e.department]))
  const lateCount = rows.filter((r) => {
    const inMin = timeToMinutes(r.checkIn)
    return inMin !== null && inMin > workStart
  }).length

  const selectCls = "rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"

  const deptLabel = department === ALL_DEPARTMENTS ? "ทุกฝ่าย" : department

  /** Exports exactly what the table below shows — complete days first, then the days
   * whose clock times are incomplete (blank in the computed columns). */
  const handleExport = () => {
    const completeRows: (string | number)[][] = rows.map((r) => [
      r.date,
      r.employeeName,
      deptByName.get(r.employeeName) ?? "",
      r.checkIn ?? "",
      r.checkOut ?? "",
      r.workedHours,
      ARRIVAL_STATUS_LABEL[arrivalStatus(r.checkIn, otConfig)],
      r.parcels,
      r.items,
      r.parcelsPerHour,
      r.dynamicTarget,
      Number(r.achievementPct.toFixed(1)),
    ])
    const partialExportRows: (string | number)[][] = partialRows.map((r) => [
      r.date,
      r.employeeName,
      deptByName.get(r.employeeName) ?? "",
      r.checkIn ?? "",
      r.checkOut ?? "",
      "",
      r.checkOut ? "ขาดเวลาเข้า" : "ยังไม่ลงเวลาออก",
      r.parcels,
      r.items,
      "",
      "",
      "",
    ])
    const tableRows = [...completeRows, ...partialExportRows].sort((a, b) =>
      String(b[0]).localeCompare(String(a[0])) || String(a[1]).localeCompare(String(b[1]))
    )

    void downloadReportExcel({
      filename: `attendance_${activeMonth}_${deptLabel}_${employee === "all" ? "ทั้งหมด" : employee}.xlsx`,
      period: `${formatMonthLabel(activeMonth)} (${range.start} – ${range.end})`,
      employeeFilter: `ฝ่าย: ${deptLabel} · พนักงาน: ${employee === "all" ? "ทั้งหมด" : employee}`,
      summary: [
        { label: "บันทึกเวลารวม (รายการ)", value: totalTimeRecords },
        { label: "พนักงาน (คน)", value: summary.employeeCount },
        { label: "วันที่มีบันทึก (วัน)", value: summary.dayCount },
        { label: `เข้างานหลัง ${otConfig.workStartHour}:00 (ครั้ง)`, value: lateCount },
        { label: "ชั่วโมงทำงานรวม (ชม.)", value: summary.totalWorkedHours },
        { label: "พัสดุเฉลี่ย/คน/วัน", value: summary.avgParcelsPerPersonPerDay },
        { label: "สินค้าเฉลี่ย/คน/วัน", value: summary.avgItemsPerPersonPerDay },
        { label: "พัสดุเฉลี่ย/ชม.", value: summary.avgParcelsPerHour },
        { label: "สินค้าเฉลี่ย/ชม.", value: summary.avgItemsPerHour },
      ],
      staffing: {
        message:
          partialRows.length > 0
            ? `มี ${partialRows.length} รายการที่ลงเวลาไม่ครบ (ขาดเวลาเข้าหรือออก) — คำนวณ ชม.ทำงานไม่ได้`
            : "ทุกรายการลงเวลาเข้า-ออกครบถ้วน",
        ok: partialRows.length === 0,
      },
      tableTitle: "บันทึกเวลาเข้า-ออกงาน",
      tableHeaders: [
        "วันที่",
        "พนักงาน",
        "ฝ่าย",
        "เวลาเข้า",
        "เวลาออก",
        "ชม.ทำงาน",
        "สถานะเข้างาน",
        "พัสดุ",
        "สินค้า",
        "พัสดุ/ชม.",
        "เป้าหมาย",
        "Achievement (%)",
      ],
      tableRows,
    })
  }

  return (
    <div className="space-y-4">
      {!hasTime && <OtDataNotice />}

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground">เดือน</label>
          <select value={activeMonth} onChange={(e) => setSelectedMonth(e.target.value)} className={selectCls + " font-semibold"}>
            {availableMonths.map((m) => (
              <option key={m} value={m} className="bg-popover text-popover-foreground">
                {formatMonthLabel(m)}{m === currentMonth ? " (เดือนนี้)" : ""}
              </option>
            ))}
          </select>
        </div>
        {departments.length > 1 && (
          <div>
            <label className="block text-[11px] text-muted-foreground">ฝ่าย</label>
            <select
              value={department}
              onChange={(e) => { setDepartment(e.target.value); setEmployee("all") }}
              className={selectCls + " font-semibold"}
            >
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
        <div className="ml-auto text-right">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={totalTimeRecords === 0}>
            <Download className="size-4" /> ดึงรายงาน (Excel)
          </Button>
          <p className="mt-1 text-[11px] text-muted-foreground">
            ส่งออก {totalTimeRecords} รายการตามตัวกรองด้านซ้าย
          </p>
        </div>
      </div>

      <div className="glass-panel flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">ตารางเวลาทำงานปกติ</span>
        <span>เข้างาน {otConfig.workStartHour}:00–{otConfig.workEndHour}:00</span>
        <span>พักเที่ยง {otConfig.lunchStartHour}:00–{otConfig.lunchEndHour}:00</span>
        <span>ทำงานสุทธิ {otConfig.workEndHour - otConfig.workStartHour - (otConfig.lunchEndHour - otConfig.lunchStartHour)} ชม./วัน</span>
        <span>เริ่มบันทึกเวลา {otConfig.attendanceStartDate}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="บันทึกเวลารวม" value={totalTimeRecords} icon={LogIn} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="รายการ" />
        <KpiCard title="พนักงาน" value={summary.employeeCount} icon={Users} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="คน" />
        <KpiCard title="วันที่มีบันทึก" value={summary.dayCount} icon={CalendarCheck2} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="วัน" />
        <KpiCard title={`เข้างานหลัง ${otConfig.workStartHour}:00`} value={lateCount} icon={Clock} gradient="bg-gradient-to-br from-amber-500 to-rose-500" suffix="ครั้ง" />
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Gauge className="size-3.5" /> วิเคราะห์ผลงานต่อชั่วโมงทำงาน (หักพักเที่ยง {otConfig.lunchStartHour}:00–{otConfig.lunchEndHour}:00)
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard title="ชั่วโมงทำงานรวม" value={summary.totalWorkedHours} icon={Timer} gradient="bg-gradient-to-br from-brand-500 to-brand-700" formatValue={(n) => n.toFixed(1)} suffix="ชม." />
          <KpiCard title="พัสดุเฉลี่ย/คน/วัน" value={summary.avgParcelsPerPersonPerDay} icon={PackageCheck} gradient="bg-gradient-to-br from-brand-400 to-brand-600" suffix="พัสดุ" />
          <KpiCard title="สินค้าเฉลี่ย/คน/วัน" value={summary.avgItemsPerPersonPerDay} icon={Boxes} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="ชิ้น" />
          <KpiCard title="พัสดุเฉลี่ย/ชม." value={summary.avgParcelsPerHour} icon={Gauge} gradient="bg-gradient-to-br from-violet-500 to-brand-600" formatValue={(n) => n.toFixed(1)} suffix="พัสดุ/ชม." />
          <KpiCard title="สินค้าเฉลี่ย/ชม." value={summary.avgItemsPerHour} icon={Gauge} gradient="bg-gradient-to-br from-amber-500 to-rose-500" formatValue={(n) => n.toFixed(1)} suffix="ชิ้น/ชม." />
        </div>
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">บันทึกเวลาเข้า-ออกงาน — {formatMonthLabel(activeMonth)}</h3>
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">วันที่</th>
              <th className="pb-2 font-medium">พนักงาน</th>
              <th className="pb-2 font-medium">ฝ่าย</th>
              <th className="pb-2 font-medium">เวลาเข้า</th>
              <th className="pb-2 font-medium">เวลาออก</th>
              <th className="pb-2 font-medium">ชม.ทำงาน</th>
              <th className="pb-2 font-medium">สถานะเข้างาน</th>
              <th className="pb-2 font-medium">งานที่ทำ</th>
              <th className="pb-2 font-medium">พัสดุ/ชม.</th>
              <th className="pb-2 font-medium">เป้าหมาย</th>
              <th className="pb-2 font-medium">Achievement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const inMin = timeToMinutes(r.checkIn)
              const late = inMin !== null && inMin > workStart
              return (
                <tr key={`${r.date}-${r.employeeName}-${i}`} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-foreground">{r.date}</td>
                  <td className="py-2 text-foreground">{r.employeeName}</td>
                  <td className="py-2 text-muted-foreground">{deptByName.get(r.employeeName) ?? "-"}</td>
                  <td className="py-2 text-muted-foreground">{r.checkIn ?? "-"}</td>
                  <td className="py-2 text-muted-foreground">{r.checkOut ?? "-"}</td>
                  <td className="py-2 font-semibold text-foreground">{r.workedHours.toFixed(2)}</td>
                  <td className="py-2">
                    {r.earlyStart ? (
                      <Badge variant="secondary">เข้าก่อน (ส่งด่วน)</Badge>
                    ) : late ? (
                      <Badge variant="destructive">สาย</Badge>
                    ) : (
                      <Badge variant="default">ตรงเวลา</Badge>
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">{r.parcels} พัสดุ · {r.items} ชิ้น</td>
                  <td className="py-2 text-muted-foreground">{r.parcelsPerHour.toFixed(1)}</td>
                  <td className="py-2 text-muted-foreground">{r.dynamicTarget}</td>
                  <td className={r.achievementPct >= 100 ? "py-2 font-semibold text-emerald-glow" : "py-2 text-muted-foreground"}>
                    {r.achievementPct.toFixed(0)}%
                  </td>
                </tr>
              )
            })}
            {partialRows.map((r, i) => (
              <tr key={`p-${r.date}-${r.employeeName}-${i}`} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-foreground">{r.date}</td>
                <td className="py-2 text-foreground">{r.employeeName}</td>
                <td className="py-2 text-muted-foreground">{deptByName.get(r.employeeName) ?? "-"}</td>
                <td className="py-2 text-muted-foreground">{r.checkIn ?? "-"}</td>
                <td className="py-2 text-muted-foreground">{r.checkOut ?? "-"}</td>
                <td className="py-2 text-muted-foreground">-</td>
                <td className="py-2">
                  <Badge variant="outline">{r.checkOut ? "ขาดเวลาเข้า" : "ยังไม่ลงเวลาออก"}</Badge>
                </td>
                <td className="py-2 text-muted-foreground">{r.parcels} พัสดุ · {r.items} ชิ้น</td>
                <td className="py-2 text-muted-foreground">-</td>
                <td className="py-2 text-muted-foreground">-</td>
                <td className="py-2 text-muted-foreground">-</td>
              </tr>
            ))}
            {rows.length === 0 && partialRows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-muted-foreground">
                  {hasTime ? "ไม่มีบันทึกเวลาในเดือนนี้" : "ยังไม่มีข้อมูลเวลาเข้า-ออกงานในระบบ"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">
        ชม.ทำงาน = เวลาออก − เวลาเข้า − พักเที่ยง · เป้าหมาย = ({otConfig.dailyTarget} ÷ {otConfig.workEndHour - otConfig.workStartHour - (otConfig.lunchEndHour - otConfig.lunchStartHour)} ชม.) × ชม.ทำงานจริง (Dynamic Target) · "เข้าก่อน (ส่งด่วน)" = เข้าก่อน {otConfig.workStartHour}:00 (นับเป็นชั่วโมงทำงาน ไม่ใช่ OT) · แสดงทุกวันที่ลงเวลาไว้ตั้งแต่ {otConfig.attendanceStartDate}; วันที่ลงเวลาไม่ครบจะแสดง "-" ในช่องที่คำนวณไม่ได้ และไม่ถูกนำไปเฉลี่ยผลงาน
      </p>
    </div>
  )
}
