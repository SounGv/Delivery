import { useMemo, useState } from "react"
import { AlertTriangle, Boxes, CalendarCheck2, CheckCircle2, Download, PackageCheck, Printer, Target, Trophy, Users } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/kpi/KpiCard"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { addDays, filterEmployeeByDateRange, percentChange, rankEmployeesByTotal } from "@/lib/dashboard-selectors"
import { dateFromIso, formatFullDateLabel, formatMonthLabel, formatNumber } from "@/lib/format"
import { downloadReportExcel } from "@/lib/exportReportExcel"
import { cn } from "@/lib/utils"

interface ReportRow {
  date: string
  employee: string
  parcels: number | null
  items: number | null
}

interface MonthlyRow {
  month: string
  parcels: number
  items: number
  activeDays: number
  employeeCount: number
}

type ReportView = "day" | "month"

/** Totals rows for a given date window against the currently-filtered employee set. */
function summarizeWindow(dates: string[], employees: { name: string; byDate: Record<string, { parcels: number | null; items: number | null }> }[]) {
  let parcels = 0
  let items = 0
  let personDays = 0
  const days = new Set<string>()
  const people = new Set<string>()
  for (const date of dates) {
    for (const employee of employees) {
      const entry = employee.byDate[date]
      if (entry && (entry.parcels !== null || entry.items !== null)) {
        parcels += entry.parcels ?? 0
        items += entry.items ?? 0
        personDays += 1
        days.add(date)
        people.add(employee.name)
      }
    }
  }
  return { parcels, items, days: days.size, people: people.size, personDays }
}

export function Reports() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const sortedDates = useMemo(() => (data ? [...data.dates].sort() : []), [data])

  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [employeeFilter, setEmployeeFilter] = useState<string>("all")
  const [view, setView] = useState<ReportView>("day")
  const [targetOverride, setTargetOverride] = useState<number | null>(null)

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const effectiveStart = startDate || sortedDates[0] || ""
  const effectiveEnd = endDate || sortedDates[sortedDates.length - 1] || ""

  const filteredDates = sortedDates.filter((d) => d >= effectiveStart && d <= effectiveEnd)
  const employees = employeeFilter === "all" ? data.employees : data.employees.filter((e) => e.name === employeeFilter)

  const rows: ReportRow[] = []
  for (const date of filteredDates) {
    for (const employee of employees) {
      const entry = employee.byDate[date]
      if (entry && (entry.parcels !== null || entry.items !== null)) {
        rows.push({ date, employee: employee.name, parcels: entry.parcels, items: entry.items })
      }
    }
  }

  const totalParcels = rows.reduce((sum, r) => sum + (r.parcels ?? 0), 0)
  const totalItems = rows.reduce((sum, r) => sum + (r.items ?? 0), 0)
  const uniqueDays = new Set(rows.map((r) => r.date)).size
  // Distinct headcount across the WHOLE selected range (people who worked at least once) —
  // over a multi-month range this is much bigger than how many actually show up on any given day.
  const uniqueEmployees = new Set(rows.map((r) => r.employee)).size
  // `rows` has one entry per employee per day they were active, so its length is total person-days —
  // dividing by that (not by `uniqueEmployees`) gives the true daily headcount and per-person averages.
  const totalPersonDays = rows.length
  const avgActiveEmployeesPerDay = uniqueDays > 0 ? totalPersonDays / uniqueDays : 0

  const avgParcelsPerDay = uniqueDays > 0 ? totalParcels / uniqueDays : 0
  const avgItemsPerDay = uniqueDays > 0 ? totalItems / uniqueDays : 0
  const avgParcelsPerPersonPerDay = totalPersonDays > 0 ? totalParcels / totalPersonDays : 0
  const avgItemsPerPersonPerDay = totalPersonDays > 0 ? totalItems / totalPersonDays : 0

  // Previous period of the same length, for the "vs. last period" comparison arrows.
  const rangeSpanDays =
    Math.max(1, Math.round((dateFromIso(effectiveEnd).getTime() - dateFromIso(effectiveStart).getTime()) / 86_400_000)) + 1
  const prevEnd = addDays(effectiveStart, -1)
  const prevStart = addDays(prevEnd, -(rangeSpanDays - 1))
  const prevWindow = summarizeWindow(
    sortedDates.filter((d) => d >= prevStart && d <= prevEnd),
    employees
  )
  const prevAvgParcelsPerDay = prevWindow.days > 0 ? prevWindow.parcels / prevWindow.days : 0
  const prevAvgItemsPerDay = prevWindow.days > 0 ? prevWindow.items / prevWindow.days : 0
  const prevAvgParcelsPerPersonPerDay = prevWindow.personDays > 0 ? prevWindow.parcels / prevWindow.personDays : 0
  const prevAvgItemsPerPersonPerDay = prevWindow.personDays > 0 ? prevWindow.items / prevWindow.personDays : 0

  const parcelsPerDayTrend = percentChange(avgParcelsPerDay, prevAvgParcelsPerDay)
  const itemsPerDayTrend = percentChange(avgItemsPerDay, prevAvgItemsPerDay)
  const parcelsPerPersonTrend = percentChange(avgParcelsPerPersonPerDay, prevAvgParcelsPerPersonPerDay)
  const itemsPerPersonTrend = percentChange(avgItemsPerPersonPerDay, prevAvgItemsPerPersonPerDay)

  // Progress-vs-target — target defaults from the per-person daily target × the REAL average
  // daily headcount (not the cumulative roster count), but the manager can override it directly.
  const autoTarget = Math.max(50, Math.round(((data.target?.value ?? 350) * (avgActiveEmployeesPerDay || 1)) / 50) * 50)
  const effectiveTarget = targetOverride ?? autoTarget
  const progressPct = effectiveTarget > 0 ? Math.min(100, Math.max(0, (avgParcelsPerDay / effectiveTarget) * 100)) : 0

  // Top employee is always ranked across the whole team for the selected range, independent of the employee filter above.
  const teamInRange = data.employees.map((e) => filterEmployeeByDateRange(e, effectiveStart, effectiveEnd))
  const teamRanking = rankEmployeesByTotal(teamInRange)
  const topEmployee = teamRanking[0]
  const teamTotalParcels = teamInRange.reduce((s, e) => s + e.totalParcels, 0)
  const teamTotalItems = teamInRange.reduce((s, e) => s + e.totalItems, 0)
  const topSharePct =
    topEmployee && teamTotalParcels + teamTotalItems > 0
      ? ((topEmployee.totalParcels + topEmployee.totalItems) / (teamTotalParcels + teamTotalItems)) * 100
      : 0

  // Staffing check: how many people the current workload actually needs at the per-person daily
  // target, vs. how many actually work on a typical day (not the cumulative roster count) —
  // so a manager can tell "orders are outgrowing headcount".
  const targetPerPerson = data.target?.value ?? 350
  const requiredHeadcount = targetPerPerson > 0 ? Math.ceil((avgParcelsPerDay + avgItemsPerDay) / targetPerPerson) : 0
  const currentHeadcount = Math.round(avgActiveEmployeesPerDay)
  const headcountGap = requiredHeadcount - currentHeadcount

  const monthlyMap = new Map<string, { parcels: number; items: number; days: Set<string>; employees: Set<string> }>()
  for (const r of rows) {
    const month = r.date.slice(0, 7)
    const bucket = monthlyMap.get(month) ?? { parcels: 0, items: 0, days: new Set<string>(), employees: new Set<string>() }
    bucket.parcels += r.parcels ?? 0
    bucket.items += r.items ?? 0
    bucket.days.add(r.date)
    bucket.employees.add(r.employee)
    monthlyMap.set(month, bucket)
  }
  const monthlyRows: MonthlyRow[] = [...monthlyMap.entries()]
    .map(([month, b]) => ({ month, parcels: b.parcels, items: b.items, activeDays: b.days.size, employeeCount: b.employees.size }))
    .sort((a, b) => b.month.localeCompare(a.month))

  const currentMonthKey = data.todayDate.slice(0, 7)

  const handleExportExcel = () => {
    const summary = [
      { label: "รวมพัสดุ", value: totalParcels },
      { label: "รวมสินค้า", value: totalItems },
      { label: "วันทำงาน", value: uniqueDays },
      { label: "พนักงานเฉลี่ย/วัน", value: Number(avgActiveEmployeesPerDay.toFixed(1)) },
      { label: "พนักงานสะสมทั้งช่วง (มีข้อมูลอย่างน้อย 1 วัน)", value: uniqueEmployees },
      { label: "พัสดุเฉลี่ย/วัน", value: Math.round(avgParcelsPerDay) },
      { label: "สินค้าเฉลี่ย/วัน", value: Math.round(avgItemsPerDay) },
      { label: "พัสดุเฉลี่ย/คน/วัน", value: Math.round(avgParcelsPerPersonPerDay) },
      { label: "สินค้าเฉลี่ย/คน/วัน", value: Math.round(avgItemsPerPersonPerDay) },
      { label: "เป้าพัสดุ/วัน", value: effectiveTarget },
      { label: "Progress เทียบเป้า (%)", value: Number(progressPct.toFixed(1)) },
      { label: "พนักงานยอดเยี่ยม", value: topEmployee?.name ?? "-" },
      { label: "พนักงานยอดเยี่ยม - พัสดุ", value: topEmployee?.totalParcels ?? 0 },
      { label: "พนักงานยอดเยี่ยม - สินค้า", value: topEmployee?.totalItems ?? 0 },
      { label: "พนักงานยอดเยี่ยม - สัดส่วนของทีม (%)", value: Number(topSharePct.toFixed(1)) },
      { label: "พนักงานที่ต้องการตามเป้า (คน)", value: requiredHeadcount },
      { label: "พนักงานที่ทำงานจริงเฉลี่ย/วัน (ปัดเศษ)", value: currentHeadcount },
      { label: "ส่วนต่างกำลังคน (บวก = ขาด, ลบ = เกิน)", value: headcountGap },
    ]
    const staffing = {
      ok: headcountGap <= 0,
      message:
        headcountGap > 0
          ? `ขาดพนักงาน ${headcountGap} คน — ออเดอร์มากกว่ากำลังคนที่มี`
          : headcountGap === 0
            ? "กำลังคนพอดีกับปริมาณงาน"
            : `กำลังคนเพียงพอ (เกินความจำเป็น ${-headcountGap} คน)`,
    }
    const period = `${effectiveStart} ถึง ${effectiveEnd}`
    const employeeLabel = employeeFilter === "all" ? "ทั้งหมด" : employeeFilter

    if (view === "month") {
      downloadReportExcel({
        filename: `warehouse-monthly-summary_${effectiveStart}_${effectiveEnd}.xlsx`,
        period,
        employeeFilter: employeeLabel,
        summary,
        staffing,
        tableTitle: "รายเดือน",
        tableHeaders: ["เดือน", "พัสดุ", "สินค้า", "จำนวนวันทำงาน", "จำนวนพนักงาน"],
        tableRows: monthlyRows.map((m) => [formatMonthLabel(m.month), m.parcels, m.items, m.activeDays, m.employeeCount]),
      })
      return
    }
    downloadReportExcel({
      filename: `warehouse-report_${effectiveStart}_${effectiveEnd}.xlsx`,
      period,
      employeeFilter: employeeLabel,
      summary,
      staffing,
      tableTitle: "รายวัน",
      tableHeaders: ["วันที่", "พนักงาน", "พัสดุ", "สินค้า"],
      tableRows: rows.map((r) => [r.date, r.employee, r.parcels ?? "", r.items ?? ""]),
    })
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground">ช่วงวันที่</label>
          <DateRangePicker
            start={effectiveStart}
            end={effectiveEnd}
            minDate={sortedDates[0] ?? effectiveStart}
            maxDate={sortedDates[sortedDates.length - 1] ?? effectiveEnd}
            today={data.todayDate}
            onChange={({ start, end }) => {
              setStartDate(start)
              setEndDate(end)
            }}
          />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground" htmlFor="employee-filter">พนักงาน</label>
          <select
            id="employee-filter"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
          >
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {data.employees.map((e) => (
              <option key={e.name} value={e.name} className="bg-popover text-popover-foreground">{e.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-1 rounded-xl border border-border p-1">
          {(["day", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v === "day" ? "รายวัน" : "รายเดือน"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExportExcel}>
            <Download className="size-4" /> Export Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="รวมพัสดุ" value={totalParcels} icon={PackageCheck} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="พัสดุ" />
        <KpiCard title="รวมสินค้า" value={totalItems} icon={Boxes} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="ชิ้น" />
        <KpiCard title="วันทำงาน" value={uniqueDays} icon={CalendarCheck2} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="วัน" />
        <KpiCard
          title="พนักงานเฉลี่ย/วัน"
          value={avgActiveEmployeesPerDay}
          icon={Users}
          gradient="bg-gradient-to-br from-amber-500 to-rose-500"
          formatValue={(n) => n.toFixed(1)}
          suffix="คน/วัน"
          subtitle={`สะสมทั้งช่วง ${formatNumber(uniqueEmployees)} คน`}
        />
        <KpiCard
          title="พัสดุเฉลี่ย/วัน"
          value={avgParcelsPerDay}
          icon={PackageCheck}
          gradient="bg-gradient-to-br from-brand-400 to-brand-600"
          formatValue={(n) => n.toFixed(0)}
          suffix="พัสดุ/วัน"
          trend={parcelsPerDayTrend !== null ? { value: parcelsPerDayTrend, label: "เทียบช่วงก่อน" } : undefined}
        />
        <KpiCard
          title="สินค้าเฉลี่ย/วัน"
          value={avgItemsPerDay}
          icon={Boxes}
          gradient="bg-gradient-to-br from-emerald-glow to-brand-600"
          formatValue={(n) => n.toFixed(0)}
          suffix="ชิ้น/วัน"
          trend={itemsPerDayTrend !== null ? { value: itemsPerDayTrend, label: "เทียบช่วงก่อน" } : undefined}
        />
        <KpiCard
          title="พัสดุเฉลี่ย/คน/วัน"
          value={avgParcelsPerPersonPerDay}
          icon={Users}
          gradient="bg-gradient-to-br from-violet-500 to-brand-600"
          formatValue={(n) => n.toFixed(0)}
          suffix="พัสดุ/คน/วัน"
          trend={parcelsPerPersonTrend !== null ? { value: parcelsPerPersonTrend, label: "เทียบช่วงก่อน" } : undefined}
        />
        <KpiCard
          title="สินค้าเฉลี่ย/คน/วัน"
          value={avgItemsPerPersonPerDay}
          icon={Boxes}
          gradient="bg-gradient-to-br from-amber-500 to-rose-500"
          formatValue={(n) => n.toFixed(0)}
          suffix="ชิ้น/คน/วัน"
          trend={itemsPerPersonTrend !== null ? { value: itemsPerPersonTrend, label: "เทียบช่วงก่อน" } : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Target className="size-4 text-brand-400" /> Progress เป้าพัสดุ/วัน
            </h3>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              เป้า
              <input
                type="number"
                min={50}
                step={50}
                value={effectiveTarget}
                onChange={(e) => setTargetOverride(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-foreground outline-none"
              />
              พัสดุ/วัน
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            ปัจจุบัน {formatNumber(Math.round(avgParcelsPerDay))} / เป้า {formatNumber(effectiveTarget)} พัสดุ/วัน
          </p>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progressPct >= 100 ? "bg-emerald-glow" : progressPct >= 80 ? "bg-amber-500" : "bg-destructive"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p
            className={cn(
              "mt-1 text-xs font-semibold",
              progressPct >= 100 ? "text-emerald-glow" : progressPct >= 80 ? "text-amber-500" : "text-destructive"
            )}
          >
            {progressPct.toFixed(1)}%
          </p>
        </div>

        <KpiCard
          title="พนักงานยอดเยี่ยม"
          value={null}
          valueText={topEmployee?.name ?? "-"}
          subtitle={
            topEmployee
              ? `${formatNumber(topEmployee.totalItems)} ชิ้น · ${formatNumber(topEmployee.totalParcels)} พัสดุ · ${topSharePct.toFixed(1)}% ของทีม`
              : undefined
          }
          icon={Trophy}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
        />

        <div className="glass-panel rounded-2xl p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Users className="size-4 text-brand-400" /> วิเคราะห์กำลังคน
          </h3>
          <p className="text-xs text-muted-foreground">
            ปริมาณงานเฉลี่ย {formatNumber(Math.round(avgParcelsPerDay + avgItemsPerDay))} รายการ/วัน ต้องการพนักงานประมาณ{" "}
            <span className="font-semibold text-foreground">{requiredHeadcount} คน</span> (เป้า {targetPerPerson}/คน/วัน) · เฉลี่ยที่ทำงานจริง{" "}
            <span className="font-semibold text-foreground">{currentHeadcount} คน/วัน</span> (สะสมทั้งช่วง {formatNumber(uniqueEmployees)} คน)
          </p>
          <div
            className={cn(
              "mt-3 flex items-center gap-2 rounded-xl p-2.5 text-sm font-semibold",
              headcountGap > 0 ? "bg-destructive/15 text-destructive" : "bg-emerald-glow/15 text-emerald-glow"
            )}
          >
            {headcountGap > 0 ? <AlertTriangle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
            {headcountGap > 0
              ? `ขาดพนักงาน ${headcountGap} คน — ออเดอร์มากกว่ากำลังคนที่มี`
              : headcountGap === 0
                ? "กำลังคนพอดีกับปริมาณงาน"
                : `กำลังคนเพียงพอ (เกินความจำเป็น ${-headcountGap} คน)`}
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          {formatFullDateLabel(effectiveStart)} - {formatFullDateLabel(effectiveEnd)} · {employeeFilter === "all" ? "พนักงานทั้งหมด" : employeeFilter}
        </p>

        {view === "day" ? (
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-2 font-medium">วันที่</th>
                <th className="pb-2 font-medium">พนักงาน</th>
                <th className="pb-2 font-medium">พัสดุ</th>
                <th className="pb-2 font-medium">สินค้า</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.date}-${r.employee}-${idx}`} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-foreground">{r.date}</td>
                  <td className="py-2 text-muted-foreground">{r.employee}</td>
                  <td className="py-2 text-muted-foreground">{formatNumber(r.parcels)}</td>
                  <td className="py-2 text-muted-foreground">{formatNumber(r.items)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-2 font-medium">เดือน</th>
                <th className="pb-2 font-medium">พัสดุ</th>
                <th className="pb-2 font-medium">สินค้า</th>
                <th className="pb-2 font-medium">วันทำงาน</th>
                <th className="pb-2 font-medium">พนักงาน</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((m) => (
                <tr key={m.month} className={cn("border-b border-white/5 last:border-0", m.month === currentMonthKey && "bg-primary/5")}>
                  <td className="py-2 text-foreground">
                    {formatMonthLabel(m.month)}
                    {m.month === currentMonthKey && (
                      <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">เดือนนี้</span>
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">{formatNumber(m.parcels)}</td>
                  <td className="py-2 text-muted-foreground">{formatNumber(m.items)}</td>
                  <td className="py-2 text-muted-foreground">{m.activeDays}</td>
                  <td className="py-2 text-muted-foreground">{m.employeeCount}</td>
                </tr>
              ))}
              {monthlyRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Grand-total summary — intentionally placed after the table so it lands
          at the bottom of the printed document, not just the on-screen top. */}
      <div className="glass-panel rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">สรุปผลรวม</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-muted-foreground">รวมพัสดุ</p>
            <p className="text-lg font-bold text-foreground">{formatNumber(totalParcels)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">รวมสินค้า</p>
            <p className="text-lg font-bold text-foreground">{formatNumber(totalItems)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">วันทำงาน</p>
            <p className="text-lg font-bold text-foreground">{formatNumber(uniqueDays)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">พนักงานเฉลี่ย/วัน</p>
            <p className="text-lg font-bold text-foreground">{avgActiveEmployeesPerDay.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">พนักงานสะสมทั้งช่วง</p>
            <p className="text-lg font-bold text-foreground">{formatNumber(uniqueEmployees)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">พัสดุเฉลี่ย/วัน</p>
            <p className="text-lg font-bold text-foreground">{formatNumber(Math.round(avgParcelsPerDay))}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">สินค้าเฉลี่ย/วัน</p>
            <p className="text-lg font-bold text-foreground">{formatNumber(Math.round(avgItemsPerDay))}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">พัสดุเฉลี่ย/คน/วัน</p>
            <p className="text-lg font-bold text-foreground">{formatNumber(Math.round(avgParcelsPerPersonPerDay))}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">สินค้าเฉลี่ย/คน/วัน</p>
            <p className="text-lg font-bold text-foreground">{formatNumber(Math.round(avgItemsPerPersonPerDay))}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
