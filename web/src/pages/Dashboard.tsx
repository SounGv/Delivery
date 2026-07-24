import { lazy, Suspense } from "react"
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CalendarRange,
  Clock,
  FileText,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  Target,
  Users,
} from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { CategoryStatusPanel } from "@/components/charts/CategoryStatusPanel"
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { useSettings, useOtConfig } from "@/lib/settingsContext"
import { datasetHasTimeData, summaryForDate, summaryForMonth } from "@/lib/ot"
import {
  countCategoryEntries,
  datesInMonth,
  findCategory,
  getTargetAchievementPercent,
  getTeamTotalForDate,
  monthKeyOf,
} from "@/lib/dashboard-selectors"

// ECharts pulls in a large canvas-rendering library; split it into its own
// chunk so KPI cards paint immediately while charts stream in behind them.
const OutputTrendChart = lazy(() =>
  import("@/components/charts/OutputTrendChart").then((m) => ({ default: m.OutputTrendChart }))
)
const EmployeeRankingChart = lazy(() =>
  import("@/components/charts/EmployeeRankingChart").then((m) => ({ default: m.EmployeeRankingChart }))
)
const ProductivityHeatmap = lazy(() =>
  import("@/components/charts/ProductivityHeatmap").then((m) => ({ default: m.ProductivityHeatmap }))
)
const ShopSlaChart = lazy(() =>
  import("@/components/charts/ShopSlaChart").then((m) => ({ default: m.ShopSlaChart }))
)

function ChartFallback({ height = 320 }: { height?: number }) {
  return <Skeleton className="rounded-2xl" style={{ height }} />
}

export function Dashboard() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const { targetOverride } = useSettings()
  const otConfig = useOtConfig()

  if (isLoading) {
    return <LoadingSkeletonGrid count={8} />
  }

  if (isError || !data) {
    return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />
  }

  const today = getTeamTotalForDate(data, data.todayDate)
  const monthKey = monthKeyOf(data.todayDate)
  const monthDates = datesInMonth(data.dates, monthKey)
  const errorsThisMonth = countCategoryEntries(findCategory(data.categories, "ความผิดพลาด"), monthDates)
  const returnsThisMonth = countCategoryEntries(findCategory(data.categories, "CN"), monthDates)
  const targetPct = getTargetAchievementPercent(data, targetOverride)
  const targetLabel = targetOverride ? `กำหนดเอง: ${targetOverride}` : data.target?.label

  const hasOtData = datasetHasTimeData(data.employees)
  const otToday = summaryForDate(data, data.todayDate, otConfig)
  const otMonth = summaryForMonth(data, monthKey, otConfig)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard title="Today's Parcels" value={today.parcels} icon={PackageCheck} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="พัสดุ" />
        <KpiCard title="Today's Items" value={today.items} icon={Boxes} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="ชิ้น" />
        <KpiCard title="Active Employees" value={today.activeEmployees} icon={Users} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="คน" />
        <KpiCard
          title="Target Achievement"
          value={targetPct}
          icon={Target}
          gradient="bg-gradient-to-br from-amber-500 to-rose-500"
          formatValue={(n) => n.toFixed(1)}
          suffix="%"
          subtitle={targetLabel}
        />
        <KpiCard title="Monthly Parcels" value={data.monthlyTotals.parcels} icon={CalendarRange} gradient="bg-gradient-to-br from-brand-600 to-brand-700" suffix="พัสดุ" />
        <KpiCard title="Monthly Items" value={data.monthlyTotals.items} icon={PackagePlus} gradient="bg-gradient-to-br from-emerald-glow to-emerald-glow" suffix="ชิ้น" />
        <KpiCard title="Errors (เดือนนี้)" value={errorsThisMonth} icon={AlertTriangle} gradient="bg-gradient-to-br from-rose-500 to-destructive" suffix="รายการ" />
        <KpiCard title="Returns / CN (เดือนนี้)" value={returnsThisMonth} icon={RotateCcw} gradient="bg-gradient-to-br from-amber-500 to-amber-600" suffix="รายการ" />
      </div>

      {hasOtData && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Clock className="size-3.5" /> OT
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard title="OT วันนี้" value={otToday.totalHours} icon={Clock} gradient="bg-gradient-to-br from-brand-500 to-brand-700" formatValue={(n) => n.toFixed(1)} suffix="ชม." />
            <KpiCard title="OT เดือนนี้" value={otMonth.totalHours} icon={CalendarClock} gradient="bg-gradient-to-br from-violet-500 to-brand-600" formatValue={(n) => n.toFixed(1)} suffix="ชม." />
            <KpiCard title="พนักงาน OT เดือนนี้" value={otMonth.employeeCount} icon={Users} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="คน" />
            <KpiCard title="OT รออนุมัติ" value={otMonth.pendingCount} icon={FileText} gradient="bg-gradient-to-br from-amber-500 to-rose-500" suffix="รายการ" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7">
          <Suspense fallback={<ChartFallback height={300} />}>
            <OutputTrendChart data={data} />
          </Suspense>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <Suspense fallback={<ChartFallback height={320} />}>
            <EmployeeRankingChart data={data} />
          </Suspense>
        </div>

        <div className="col-span-12">
          <Suspense fallback={<ChartFallback height={Math.max(280, 40 * data.employees.length + 80)} />}>
            <ProductivityHeatmap data={data} />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-7">
          <CategoryStatusPanel data={data} />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <RecentActivityPanel data={data} />
        </div>

        <div className="col-span-12">
          <Suspense fallback={<ChartFallback height={340} />}>
            <ShopSlaChart data={data} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
