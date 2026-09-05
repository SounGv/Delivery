import { lazy, Suspense, useMemo } from "react"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarRange,
  Clock,
  FileText,
  Minus,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  Target,
  Users,
} from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import type { Employee } from "@/api/types"
import { useEmployeeDetail } from "@/lib/employeeDetailStore"
import { KpiCard } from "@/components/kpi/KpiCard"
import { CategoryStatusPanel } from "@/components/charts/CategoryStatusPanel"
import { EmployeeWorkloadPanel } from "@/components/charts/EmployeeWorkloadPanel"
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel"
import { AlertBar } from "@/components/dashboard/AlertBar"
import { ChartCard } from "@/components/charts/ChartCard"
import { ReportSection } from "@/components/common/ReportSection"
import { EmployeeTable } from "@/components/employees/EmployeeTable"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { useSettings, useOtConfig } from "@/lib/settingsContext"
import { datasetHasTimeData, summaryForDate, summaryForMonth } from "@/lib/ot"
import { useAnimatedNumber } from "@/lib/useAnimatedNumber"
import { formatDateLabel, formatFullDateLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  buildFollowUpRows,
  countCategoryEntries,
  datesInMonth,
  filterEmployeeByDateRange,
  findCategory,
  getTargetAchievementPercent,
  getTeamTotalForDate,
  monthKeyOf,
  percentChange,
} from "@/lib/dashboard-selectors"

// ECharts pulls in a large canvas-rendering library; split it into its own
// chunk so the KPI hero paints immediately while charts stream in behind it.
const BarLineChart = lazy(() =>
  import("@/components/charts/BarLineChart").then((m) => ({ default: m.BarLineChart }))
)
const RankTrendChart = lazy(() =>
  import("@/components/charts/RankTrendChart").then((m) => ({ default: m.RankTrendChart }))
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

/** Small up/down/flat pill used inside the hero to show day-over-day change. */
function TrendBadge({ value, label = "เทียบวันก่อน" }: { value: number | null; label?: string }) {
  if (value === null) {
    return <span className="text-[11px] font-medium text-muted-foreground">— ไม่มีข้อมูลเทียบ</span>
  }
  const flat = Math.abs(value) < 0.05
  const positive = value > 0
  const Icon = flat ? Minus : positive ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        flat
          ? "bg-white/10 text-muted-foreground"
          : positive
            ? "bg-emerald-glow/15 text-emerald-glow"
            : "bg-destructive/15 text-destructive"
      )}
    >
      <Icon className="size-3" />
      {Math.abs(value).toFixed(1)}%
      <span className="font-normal opacity-70">{label}</span>
    </span>
  )
}

/** A hero sub-metric (items / active employees) shown beside the big parcel count. */
function HeroStat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  const animated = useAnimatedNumber(value)
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
        {Math.round(animated).toLocaleString("th-TH")}
        <span className="ml-1 text-sm font-medium text-muted-foreground">{suffix}</span>
      </p>
    </div>
  )
}

/** The big animated parcel count in the hero. Isolated so the animation hook
 * never sits behind Dashboard's loading/error early-returns (rules of hooks). */
function HeroParcels({ value }: { value: number }) {
  const animated = useAnimatedNumber(value)
  return (
    <span className="text-5xl font-bold leading-none tabular-nums text-foreground md:text-6xl">
      {Math.round(animated).toLocaleString("th-TH")}
    </span>
  )
}

/** Circular progress ring for target achievement. */
function TargetRing({ percent, label }: { percent: number | null; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent ?? 0))
  const animated = useAnimatedNumber(clamped)
  const size = 132
  const stroke = 12
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - animated / 100)
  const hit = clamped >= 100

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-white/10"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#ring-gradient)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
          <defs>
            <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={hit ? "#10b981" : "#3b82f6"} />
              <stop offset="100%" stopColor={hit ? "#34d399" : "#8b5cf6"} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {percent === null ? "—" : `${animated.toFixed(0)}%`}
          </span>
          <span className={cn("text-[11px] font-medium", hit ? "text-emerald-glow" : "text-muted-foreground")}>
            {percent === null ? "ไม่มีเป้า" : hit ? "ถึงเป้า 🎉" : "ของเป้า"}
          </span>
        </div>
      </div>
      {label && <p className="max-w-[12rem] truncate text-center text-xs text-muted-foreground">{label}</p>}
    </div>
  )
}

export function Dashboard() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const { targetOverride } = useSettings()
  const otConfig = useOtConfig()
  const { openEmployeeDetail } = useEmployeeDetail()

  // Hooks must run unconditionally — compute derived data after the null-guards
  // below only via plain values (no more hooks past this point).
  const targetPerPerson = targetOverride ?? data?.target?.value ?? null
  const followUpRows = useMemo(() => (data ? buildFollowUpRows(data, targetPerPerson) : []), [data, targetPerPerson])

  const recentWindow = useMemo(() => {
    if (!data) return { dates: [] as string[], employees: [] as Employee[] }
    const sorted = [...data.dates].sort()
    const dates = sorted.slice(-14)
    if (dates.length === 0) return { dates, employees: [] as Employee[] }
    const employees = data.employees.map((e) => filterEmployeeByDateRange(e, dates[0]!, dates[dates.length - 1]!))
    return { dates, employees }
  }, [data])

  if (isLoading) {
    return <LoadingSkeletonGrid count={8} />
  }

  if (isError || !data) {
    return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />
  }

  // "Today" and the previous date that actually has data, for day-over-day trends.
  const sortedDates = [...data.dates].sort()
  const todayIdx = sortedDates.indexOf(data.todayDate)
  const prevDate = todayIdx > 0 ? sortedDates[todayIdx - 1] : null

  const today = getTeamTotalForDate(data, data.todayDate)
  const prev = prevDate ? getTeamTotalForDate(data, prevDate) : null
  const parcelTrend = prev ? percentChange(today.parcels, prev.parcels) : null
  const itemTrend = prev ? percentChange(today.items, prev.items) : null

  const monthKey = monthKeyOf(data.todayDate)
  const monthDates = datesInMonth(data.dates, monthKey)
  const errorsThisMonth = countCategoryEntries(findCategory(data.categories, "ความผิดพลาด"), monthDates)
  const returnsThisMonth = countCategoryEntries(findCategory(data.categories, "CN"), monthDates)
  const targetPct = getTargetAchievementPercent(data, targetOverride)
  const targetLabel = targetOverride ? `เป้ากำหนดเอง: ${targetOverride}` : data.target?.label

  const hasOtData = datasetHasTimeData(data.employees)
  const otToday = summaryForDate(data, data.todayDate, otConfig)
  const otMonth = summaryForMonth(data, monthKey, otConfig)

  const belowTargetCount = followUpRows.filter((r) => r.status === "below-target").length

  return (
    <div className="space-y-4">
      {/* Alert bar — surfaces what needs attention before any number or chart. */}
      <AlertBar followUpRows={followUpRows} workIssues={data.workIssues} />

      {/* Hero: today's output as the focal point + target ring */}
      <div className="grid grid-cols-12 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-panel relative col-span-12 overflow-hidden rounded-2xl p-5 lg:col-span-8"
        >
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <PackageCheck className="size-3.5" /> ผลงานวันนี้
              </div>
              <span className="text-xs text-muted-foreground">{formatFullDateLabel(data.todayDate)}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <HeroParcels value={today.parcels} />
              <span className="pb-1 text-base font-medium text-muted-foreground">พัสดุ</span>
              <span className="pb-1"><TrendBadge value={parcelTrend} /></span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4">
              <HeroStat label="ชิ้นงานวันนี้" value={today.items} suffix="ชิ้น" />
              <div>
                <p className="text-xs text-muted-foreground">เทรนด์ชิ้นงาน</p>
                <p className="mt-1.5"><TrendBadge value={itemTrend} /></p>
              </div>
              <HeroStat label="พนักงานทำงาน" value={today.activeEmployees} suffix="คน" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="glass-panel col-span-12 flex flex-col items-center justify-center rounded-2xl p-5 lg:col-span-4"
        >
          <div className="mb-3 flex items-center gap-1.5 self-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="size-3.5" /> อัตราถึงเป้า
          </div>
          <TargetRing percent={targetPct} label={targetLabel} />
        </motion.div>
      </div>

      {/* Monthly summary + quality metrics + below-target headcount */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <KpiCard title="พัสดุเดือนนี้" value={data.monthlyTotals.parcels} icon={CalendarRange} gradient="bg-gradient-to-br from-brand-600 to-brand-700" suffix="พัสดุ" />
        <KpiCard title="ชิ้นงานเดือนนี้" value={data.monthlyTotals.items} icon={PackagePlus} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="ชิ้น" />
        <KpiCard title="พนักงานต่ำกว่าเป้า" value={belowTargetCount} icon={AlertTriangle} gradient="bg-gradient-to-br from-amber-500 to-destructive" suffix="คน" />
        <KpiCard title="ข้อผิดพลาด (เดือนนี้)" value={errorsThisMonth} icon={AlertTriangle} gradient="bg-gradient-to-br from-rose-500 to-destructive" suffix="รายการ" />
        <KpiCard title="ตีกลับ / CN (เดือนนี้)" value={returnsThisMonth} icon={RotateCcw} gradient="bg-gradient-to-br from-amber-500 to-amber-600" suffix="รายการ" />
      </div>

      {hasOtData && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

      {/* Who needs follow-up TODAY — before any ranking, sorted by risk not rank. */}
      <ReportSection title="ต้องติดตามวันนี้" subtitle="เรียงจากความเสี่ยงสูงไปต่ำ — ไม่ใช่อันดับ #1 ก่อน">
        <EmployeeTable rows={followUpRows} onRowClick={openEmployeeDetail} searchable emptyMessage="ไม่มีพนักงานในทีมที่เลือก" />
      </ReportSection>

      {/* Actual vs target + rank trend — the two required Performance-style charts, on page 1. */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7">
          <ChartCard title="ผลงานจริงเทียบเป้า" subtitle="พัสดุ / สินค้า รายวัน เทียบเป้าทีม (ปรับตามจำนวนคนที่ทำงานจริงวันนั้น)">
            <Suspense fallback={<ChartFallback height={300} />}>
              <BarLineChart
                categories={recentWindow.dates.map((d) => formatDateLabel(d))}
                bars={[
                  { name: "พัสดุ", data: recentWindow.dates.map((d) => data.teamTotalsByDate[d]?.parcels ?? 0) },
                  { name: "สินค้า", data: recentWindow.dates.map((d) => data.teamTotalsByDate[d]?.items ?? 0) },
                ]}
                line={{
                  name: "เป้าทีม",
                  data: recentWindow.dates.map((d) => {
                    const active = data.teamTotalsByDate[d]?.activeEmployees ?? 0
                    return targetPerPerson && active > 0 ? targetPerPerson * active : null
                  }),
                }}
                height={300}
              />
            </Suspense>
          </ChartCard>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <Suspense fallback={<ChartFallback height={300} />}>
            <RankTrendChart employees={recentWindow.employees} period="day" height={300} />
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
          <EmployeeWorkloadPanel data={data} />
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
