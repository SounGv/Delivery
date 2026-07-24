import { lazy, Suspense, useMemo, useState } from "react"
import { Boxes, Download, PackageCheck, CalendarCheck2, Search, TrendingUp, Trophy, Users } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import {
  ALL_EMPLOYEES_KEY,
  ALL_EMPLOYEES_LABEL,
  aggregateEmployeeByPeriod,
  buildTeamPseudoEmployee,
  computeTeamSummary,
  filterEmployeeByDateRange,
  rankEmployeesByTotal,
  type ReportPeriod,
} from "@/lib/dashboard-selectors"
import { formatDateLabel, formatMonthLabel, formatNumber, formatYearLabel } from "@/lib/format"
import { downloadCsv } from "@/lib/csv"
import { initialsOf } from "@/lib/avatar"
import { cn } from "@/lib/utils"

const EmployeeTrendChart = lazy(() =>
  import("@/components/employees/EmployeeTrendChart").then((m) => ({ default: m.EmployeeTrendChart }))
)
const RankingTrendChart = lazy(() =>
  import("@/components/employees/RankingTrendChart").then((m) => ({ default: m.RankingTrendChart }))
)
const EmployeeRankingTop10Chart = lazy(() =>
  import("@/components/employees/EmployeeRankingTop10Chart").then((m) => ({ default: m.EmployeeRankingTop10Chart }))
)

const PERIOD_OPTIONS: { key: ReportPeriod; label: string }[] = [
  { key: "day", label: "รายวัน" },
  { key: "month", label: "รายเดือน" },
  { key: "year", label: "รายปี" },
]

function labelFor(key: string, period: ReportPeriod): string {
  if (period === "day") return formatDateLabel(key)
  if (period === "month") return formatMonthLabel(key)
  return formatYearLabel(key)
}

export function Employees() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [period, setPeriod] = useState<ReportPeriod>("day")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [search, setSearch] = useState("")

  const sortedDates = useMemo(() => (data ? [...data.dates].sort() : []), [data])

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const effectiveStart = startDate || sortedDates[0] || ""
  const effectiveEnd = endDate || sortedDates[sortedDates.length - 1] || ""

  const filteredEmployees = data.employees.map((e) => filterEmployeeByDateRange(e, effectiveStart, effectiveEnd))
  const teamSummary = computeTeamSummary(filteredEmployees)

  const ranking = rankEmployeesByTotal(filteredEmployees)
  const activeSelection = selectedName ?? ranking[0]?.name ?? null
  const isAllSelected = activeSelection === ALL_EMPLOYEES_KEY
  const employee = isAllSelected
    ? buildTeamPseudoEmployee(filteredEmployees)
    : filteredEmployees.find((e) => e.name === activeSelection)
  const rankEntry = isAllSelected ? null : ranking.find((r) => r.name === activeSelection)

  if (!employee) {
    return <ErrorPanel message="ไม่พบข้อมูลพนักงานในชีท" />
  }

  const buckets = aggregateEmployeeByPeriod(employee, period)
  const activeDaysTotal = Object.values(employee.byDate).filter(
    (e) => (e.parcels ?? 0) > 0 || (e.items ?? 0) > 0
  ).length
  const avgItemsPerDay = activeDaysTotal > 0 ? employee.totalItems / activeDaysTotal : 0
  const avgParcelsPerDay = activeDaysTotal > 0 ? employee.totalParcels / activeDaysTotal : 0
  const activeEmployeeCount = filteredEmployees.filter((e) => e.totalItems > 0 || e.totalParcels > 0).length

  const searchedRanking = ranking.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))

  const handleExportCsv = () => {
    downloadCsv(
      `employees_${effectiveStart}_${effectiveEnd}.csv`,
      ["อันดับ", "พนักงาน", "พัสดุ", "สินค้า"],
      searchedRanking.map((r) => [r.rank, r.name, r.totalParcels, r.totalItems])
    )
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-emerald-glow text-sm font-semibold text-white">
              {isAllSelected ? <Users className="size-5" /> : initialsOf(employee.name)}
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground" htmlFor="employee-select">
                เลือกพนักงาน
              </label>
              <select
                id="employee-select"
                value={isAllSelected ? ALL_EMPLOYEES_KEY : employee.name}
                onChange={(e) => setSelectedName(e.target.value)}
                className="appearance-none rounded-lg border border-border bg-transparent py-1 pr-6 text-sm font-semibold text-foreground outline-none"
              >
                <option value={ALL_EMPLOYEES_KEY} className="bg-popover text-popover-foreground">
                  {ALL_EMPLOYEES_LABEL}
                </option>
                {ranking.map((r) => (
                  <option key={r.name} value={r.name} className="bg-popover text-popover-foreground">
                    {r.name} (#{r.rank})
                  </option>
                ))}
              </select>
            </div>
          </div>

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
            <label className="block text-[11px] text-muted-foreground" htmlFor="employee-search">
              ค้นหาพนักงาน
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="employee-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ชื่อพนักงาน..."
                className="w-36 rounded-lg border border-border bg-transparent py-1.5 pr-2 pl-7 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-xl border border-border p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriod(opt.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  period === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Users className="size-3.5" /> ผลรวมทั้งทีม (ช่วงที่เลือก)
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <KpiCard title="พัสดุรวมทีม" value={teamSummary.totalParcels} icon={PackageCheck} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="พัสดุ" />
          <KpiCard title="สินค้ารวมทีม" value={teamSummary.totalItems} icon={Boxes} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="ชิ้น" />
          <KpiCard title="วันที่ทีมทำงาน" value={teamSummary.activeDays} icon={CalendarCheck2} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="วัน" />
          <KpiCard
            title="พัสดุเฉลี่ยต่อวัน"
            value={teamSummary.avgParcelsPerDay}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-brand-400 to-brand-600"
            formatValue={(n) => n.toFixed(0)}
            suffix="พัสดุ/วัน"
          />
          <KpiCard
            title="เฉลี่ยทีมต่อวันทำงาน"
            value={teamSummary.avgItemsPerDay}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-amber-500 to-rose-500"
            formatValue={(n) => n.toFixed(0)}
            suffix="ชิ้น/วัน"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {employee.name} (ช่วงที่เลือก)
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          <KpiCard title="พัสดุสะสม" value={employee.totalParcels} icon={PackageCheck} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="พัสดุ" />
          <KpiCard title="สินค้าสะสม" value={employee.totalItems} icon={Boxes} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="ชิ้น" />
          <KpiCard title="วันที่ทำงาน" value={activeDaysTotal} icon={CalendarCheck2} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="วัน" />
          <KpiCard
            title="พัสดุเฉลี่ยต่อวัน"
            value={avgParcelsPerDay}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-brand-400 to-brand-600"
            formatValue={(n) => n.toFixed(0)}
            suffix="พัสดุ/วัน"
          />
          <KpiCard
            title="เฉลี่ยต่อวันทำงาน"
            value={avgItemsPerDay}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-amber-500 to-rose-500"
            formatValue={(n) => n.toFixed(0)}
            suffix="ชิ้น/วัน"
          />
          {isAllSelected ? (
            <KpiCard
              title="พนักงานที่ทำงาน"
              value={activeEmployeeCount}
              icon={Users}
              gradient="bg-gradient-to-br from-brand-600 to-emerald-glow"
              suffix={`/ ${ranking.length}`}
            />
          ) : (
            <KpiCard
              title="อันดับในทีม"
              value={rankEntry?.rank ?? null}
              icon={Trophy}
              gradient="bg-gradient-to-br from-brand-600 to-emerald-glow"
              suffix={`/ ${ranking.length}`}
            />
          )}
        </div>
      </div>

      <div className={cn("grid grid-cols-1 gap-4", !isAllSelected && "lg:grid-cols-2")}>
        <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
          <EmployeeTrendChart employeeName={employee.name} period={period} buckets={buckets} />
        </Suspense>
        {!isAllSelected && (
          <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
            <RankingTrendChart employees={filteredEmployees} selectedName={employee.name} period={period} />
          </Suspense>
        )}
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">รายละเอียดตามช่วงเวลา</h3>
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">ช่วงเวลา</th>
              <th className="pb-2 font-medium">พัสดุ</th>
              <th className="pb-2 font-medium">สินค้า</th>
              <th className="pb-2 font-medium">วันทำงาน</th>
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map((b) => (
              <tr key={b.key} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-foreground">{labelFor(b.key, period)}</td>
                <td className="py-2 text-muted-foreground">{formatNumber(b.parcels)}</td>
                <td className="py-2 text-muted-foreground">{formatNumber(b.items)}</td>
                <td className="py-2 text-muted-foreground">{b.activeDays}</td>
              </tr>
            ))}
            {buckets.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  ไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <EmployeeRankingTop10Chart
          ranking={ranking}
          subtitle={`อันดับตามพัสดุ ตามด้วยจำนวนสินค้า (${formatDateLabel(effectiveStart)} - ${formatDateLabel(effectiveEnd)})`}
        />
      </Suspense>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">พนักงานทั้งหมด (ช่วงที่เลือก)</h3>
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">อันดับ</th>
              <th className="pb-2 font-medium">พนักงาน</th>
              <th className="pb-2 font-medium">พัสดุ</th>
              <th className="pb-2 font-medium">สินค้า</th>
            </tr>
          </thead>
          <tbody>
            {searchedRanking.map((r) => (
              <tr key={r.name} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-muted-foreground">#{r.rank}</td>
                <td className="py-2 text-foreground">{r.name}</td>
                <td className="py-2 text-muted-foreground">{formatNumber(r.totalParcels)}</td>
                <td className="py-2 text-muted-foreground">{formatNumber(r.totalItems)}</td>
              </tr>
            ))}
            {searchedRanking.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  ไม่พบพนักงานที่ค้นหา
                </td>
              </tr>
            )}
          </tbody>
          {searchedRanking.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-semibold text-foreground">
                <td className="pt-2" colSpan={2}>
                  รวม ({searchedRanking.length} คน)
                </td>
                <td className="pt-2">{formatNumber(searchedRanking.reduce((s, r) => s + r.totalParcels, 0))}</td>
                <td className="pt-2">{formatNumber(searchedRanking.reduce((s, r) => s + r.totalItems, 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
