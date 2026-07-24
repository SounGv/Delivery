import { useMemo, useState } from "react"
import { Boxes, CalendarCheck2, Clock, Gauge, LogIn, PackageCheck, Timer, Users } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Badge } from "@/components/ui/badge"
import { OtDataNotice } from "@/components/ot/OtDataNotice"
import {
  collectWorkedHours,
  datasetHasTimeData,
  getWorkedHoursSummary,
  timeToMinutes,
} from "@/lib/ot"
import { useOtConfig } from "@/lib/settingsContext"
import { formatMonthLabel } from "@/lib/format"

export function Attendance() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const otConfig = useOtConfig()
  const [selectedMonth, setSelectedMonth] = useState("")
  const [employee, setEmployee] = useState("all")

  const availableMonths = useMemo(
    () => (data ? [...new Set(data.dates.map((d) => d.slice(0, 7)))].sort() : []),
    [data]
  )

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const hasTime = datasetHasTimeData(data.employees)
  const currentMonth = data.todayDate.slice(0, 7)
  const activeMonth = selectedMonth || currentMonth
  const workStart = otConfig.workStartHour * 60

  const range = { start: `${activeMonth}-01`, end: `${activeMonth}-31` }
  const all = collectWorkedHours(data.employees, otConfig, range)
  const rows = employee === "all" ? all : all.filter((r) => r.employeeName === employee)
  const summary = getWorkedHoursSummary(rows)

  const employeeNames = [...new Set(data.employees.map((e) => e.name))].sort()
  const lateCount = rows.filter((r) => {
    const inMin = timeToMinutes(r.checkIn)
    return inMin !== null && inMin > workStart
  }).length

  const selectCls = "rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"

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
        <div>
          <label className="block text-[11px] text-muted-foreground">พนักงาน</label>
          <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {employeeNames.map((n) => (
              <option key={n} value={n} className="bg-popover text-popover-foreground">{n}</option>
            ))}
          </select>
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
        <KpiCard title="บันทึกเวลารวม" value={rows.length} icon={LogIn} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="รายการ" />
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
            {rows.map((r) => {
              const inMin = timeToMinutes(r.checkIn)
              const late = inMin !== null && inMin > workStart
              return (
                <tr key={`${r.date}-${r.employeeName}`} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-foreground">{r.date}</td>
                  <td className="py-2 text-foreground">{r.employeeName}</td>
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted-foreground">
                  {hasTime ? "ไม่มีบันทึกเวลาในเดือนนี้" : "ยังไม่มีข้อมูลเวลาเข้า-ออกงานในระบบ"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">
        ชม.ทำงาน = เวลาออก − เวลาเข้า − พักเที่ยง · เป้าหมาย = ({otConfig.dailyTarget} ÷ {otConfig.workEndHour - otConfig.workStartHour - (otConfig.lunchEndHour - otConfig.lunchStartHour)} ชม.) × ชม.ทำงานจริง (Dynamic Target) · "เข้าก่อน (ส่งด่วน)" = เข้าก่อน {otConfig.workStartHour}:00 (นับเป็นชั่วโมงทำงาน ไม่ใช่ OT) · แสดงเฉพาะวันที่ตั้งแต่ {otConfig.attendanceStartDate} ที่มีทั้งเวลาเข้าและออก
      </p>
    </div>
  )
}
