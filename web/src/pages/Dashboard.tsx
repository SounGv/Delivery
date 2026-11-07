import { lazy, Suspense, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Ban,
  Banknote,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Coins,
  FileText,
  Layers,
  ListChecks,
  Minus,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  PackageX,
  RotateCcw,
  ShoppingCart,
  Target,
  Users,
  Warehouse,
} from "lucide-react"
import { useCancelledQuery, useFocusQuery, useRefundsQuery, useRestockQuery, useTeamDashboard } from "@/api/queries"
import type { Employee } from "@/api/types"
import { useEmployeeDetail } from "@/lib/employeeDetailStore"
import { StatTile, StatusPill, StatusTile, type Tone } from "@/components/returns/ReturnsUi"
import { CategoryStatusPanel } from "@/components/charts/CategoryStatusPanel"
import { EmployeeWorkloadPanel } from "@/components/charts/EmployeeWorkloadPanel"
import { CategoryReportPanel } from "@/components/reports/CategoryReportPanel"
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel"
import { ChartCard, ChartChip } from "@/components/charts/ChartCard"
import { ReportSection } from "@/components/common/ReportSection"
import { EmployeeTable } from "@/components/employees/EmployeeTable"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { useSettings, useOtConfig } from "@/lib/settingsContext"
import { useNavigate } from "@/lib/navigation"
import { datasetHasTimeData, summaryForDate, summaryForMonth } from "@/lib/ot"
import { useAnimatedNumber } from "@/lib/useAnimatedNumber"
import { formatDateLabel, formatFullDateLabel, formatMonthLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import { alertCount } from "@/lib/backlog-selectors"
import { DEFAULT_STALE_DAYS, computeCancelledTotals, daysBetween } from "@/lib/cancelled-selectors"
import { totalsOf } from "@/lib/restock-selectors"
import { isRefundPaid, refundTotalsOf } from "@/lib/refund-selectors"
import { summarizeRwDepartment, type RwDepartmentSummary } from "@/lib/rw-summary"
import { applyChannelFilter, computeChannelComparison, computeOrderReportTotals, sortedOrderReportDays } from "@/lib/order-report-selectors"
import {
  TEAM_LABELS,
  buildFollowUpRows,
  countCategoryEntries,
  countOpenWorkIssues,
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
  // Only used on the teal hero band, so the pill is a translucent white chip with light text.
  if (value === null) {
    return <span className="text-[11px] font-medium text-white/75">— ไม่มีข้อมูลเทียบ</span>
  }
  const flat = Math.abs(value) < 0.05
  const positive = value > 0
  const Icon = flat ? Minus : positive ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
        flat ? "bg-white/20 text-white" : positive ? "bg-white/90 text-emerald-glow" : "bg-white/90 text-coral-dark"
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
      <p className="text-xs text-white/75">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold tabular-nums text-white">
        {Math.round(animated).toLocaleString("th-TH")}
        <span className="ml-1 text-sm font-medium text-white/75">{suffix}</span>
      </p>
    </div>
  )
}

/** The big animated parcel count in the hero. Isolated so the animation hook
 * never sits behind Dashboard's loading/error early-returns (rules of hooks). */
function HeroParcels({ value }: { value: number }) {
  const animated = useAnimatedNumber(value)
  return (
    <span className="text-5xl font-extrabold leading-none tabular-nums text-white drop-shadow-sm md:text-7xl">
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
            className="text-muted"
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
              <stop offset="0%" stopColor={hit ? "#27ae60" : "#2ba8a2"} />
              <stop offset="100%" stopColor={hit ? "#7bd99f" : "#ffd23f"} />
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

/** A page section: heading, one line saying what it covers, and an optional "open the menu" link. */
function Section({
  title,
  caption,
  goTo,
  goLabel,
  children,
}: {
  title: string
  caption?: string
  goTo?: string
  goLabel?: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
          {caption && <p className="mt-0.5 text-sm text-muted-foreground">{caption}</p>}
        </div>
        {goTo && (
          <button
            type="button"
            onClick={() => navigate(goTo)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3.5 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {goLabel ?? "ดูทั้งหมด"}
            <ArrowRight className="size-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

/** Heavy detail panels stay reachable but are only mounted once opened. */
function Collapsible({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="glass-panel flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left transition-colors hover:bg-muted/40"
      >
        <span>
          <span className="block text-lg font-extrabold text-foreground">{title}</span>
          <span className="block text-sm text-muted-foreground">{caption}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && children}
    </section>
  )
}

const FOLLOW_UP_LIMIT = 8
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`
const num = (n: number) => n.toLocaleString("th-TH")

function DepartmentCard({ summary, goTo, icon: Icon }: { summary: RwDepartmentSummary; goTo: string; icon: React.ComponentType<{ className?: string }> }) {
  const navigate = useNavigate()
  const tone: Tone =
    summary.kpiCategories === 0 ? "neutral" : summary.freshKpiCategories === summary.kpiCategories ? "ok" : summary.freshKpiCategories === 0 ? "danger" : "warn"
  const StatusIcon = tone === "ok" ? CheckCircle2 : tone === "neutral" ? Minus : AlertTriangle
  return (
    <button
      type="button"
      onClick={() => navigate(goTo)}
      className="glass-panel relative overflow-hidden rounded-2xl p-4 pl-5 text-left transition-all hover:-translate-y-0.5"
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1.5",
          tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : tone === "danger" ? "bg-rose-500" : "bg-border"
        )}
        aria-hidden
      />
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <span className="text-lg font-extrabold text-foreground">{summary.title}</span>
        <StatusPill tone={tone} icon={StatusIcon} small>
          {tone === "ok" ? "ทีมกรอกข้อมูลสม่ำเสมอ" : tone === "neutral" ? "ยังไม่มีข้อมูลในชีต" : "มีหมวดที่ไม่ได้กรอก"}
        </StatusPill>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">
            เข้างาน{summary.latestDate ? ` ${formatDateLabel(summary.latestDate)}` : ""}
          </dt>
          <dd className="text-2xl font-extrabold tabular-nums text-foreground">
            {num(summary.checkedIn)} <span className="text-sm font-semibold text-muted-foreground">/ {num(summary.staffCount)} คน</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">KPI รายคนที่ยังมีคนกรอก (14 วัน)</dt>
          <dd className="text-2xl font-extrabold tabular-nums text-foreground">
            {num(summary.freshKpiCategories)} <span className="text-sm font-semibold text-muted-foreground">/ {num(summary.kpiCategories)} หมวด</span>
          </dd>
        </div>
      </dl>
    </button>
  )
}

export function Dashboard() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const { targetOverride, selectedTeam } = useSettings()
  const otConfig = useOtConfig()
  const { openEmployeeDetail } = useEmployeeDetail()
  const navigate = useNavigate()
  const focusQuery = useFocusQuery()
  const cancelledQuery = useCancelledQuery()
  const restockQuery = useRestockQuery()
  const refundsQuery = useRefundsQuery()

  // Hooks must run unconditionally — compute derived data after the null-guards
  // below only via plain values (no more hooks past this point).
  const targetPerPerson = targetOverride ?? data?.target?.value ?? null
  const followUpRows = useMemo(() => (data ? buildFollowUpRows(data, targetPerPerson) : []), [data, targetPerPerson])

  const recentWindow = useMemo(() => {
    if (!data) return { dates: [] as string[], employees: [] as Employee[] }
    // Only days up to the latest one with data: monthly tabs pre-create every calendar
    // day, so a plain "last 14 dates" lands on empty future days and blanks both charts.
    const sorted = [...data.dates].sort().filter((d) => d <= data.todayDate)
    const dates = sorted.slice(-14)
    if (dates.length === 0) return { dates, employees: [] as Employee[] }
    const employees = data.employees.map((e) => filterEmployeeByDateRange(e, dates[0]!, dates[dates.length - 1]!))
    return { dates, employees }
  }, [data])

  // Sales snapshot: the latest month the order report has, both channels combined.
  const salesSnapshot = useMemo(() => {
    const report = data?.orderReport
    if (!report) return null
    const all = sortedOrderReportDays(report.days)
    const lastDate = all[all.length - 1]?.date
    if (!lastDate) return null
    const monthDays = all.filter((d) => d.date.startsWith(lastDate.slice(0, 7)))
    return {
      lastDate,
      monthKey: lastDate.slice(0, 7),
      totals: computeOrderReportTotals(applyChannelFilter(monthDays, "all")),
      comparison: computeChannelComparison(monthDays),
    }
  }, [data?.orderReport])

  const rwSummaries = useMemo(() => {
    const deps = data?.receivingWarehouse?.departments ?? []
    return {
      warehouse: deps.find((d) => d.title === "ฝ่ายคลัง"),
      receiving: deps.find((d) => d.title === "ฝ่ายรับเข้า"),
    }
  }, [data?.receivingWarehouse])

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
  const teamLabel = TEAM_LABELS[selectedTeam]

  // ---- "ต้องตามวันนี้": one number per menu, read from the same sheets that menu shows. null = could not be read.
  const focus = focusQuery.data?.focus
  const focusOk = !!focus && !focus.error && !focus.missingTab
  const overdue = focusOk ? alertCount(focus.alerts, "เลยกำหนด") : null
  const dueToday = focusOk ? alertCount(focus.alerts, "ครบกำหนดวันนี้") : null
  const oldestBacklog = focusOk ? focus.queues.reduce((max, q) => Math.max(max, q.oldestDays ?? 0), 0) : null

  const cancelled = cancelledQuery.data?.cancelledOrders
  const cancelledOk = !!cancelled && !cancelled.error
  const cancelledTotals = cancelledOk
    ? computeCancelledTotals(cancelled.rows, cancelledQuery.data?.todayDate ?? data.todayDate, DEFAULT_STALE_DAYS)
    : null

  const restock = restockQuery.data?.restock
  const restockOk = !!restock && !restock.error && !restock.missingTab
  const restockTotals = restockOk ? totalsOf(restock.rows) : null
  const notStockedIn = restockOk ? restock.rows.filter((r) => r.stockInStatus === "ไม่ Stock-In").length : null
  const lostRows = restockOk ? restock.rows.filter((r) => r.returnStatus === "สูญหาย").length : null

  const refunds = refundsQuery.data?.refunds
  const refundsOk = !!refunds && !refunds.error && !refunds.missingTab
  const unpaid = refundsOk ? refundTotalsOf(refunds.rows.filter((r) => !isRefundPaid(r))) : null

  const openIssues = countOpenWorkIssues(data.workIssues)

  const attentionTone = (count: number | null, bad: Tone = "danger"): Tone => (count === null ? "neutral" : count > 0 ? bad : "ok")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">ภาพรวมทีมคลัง</h1>
          <p className="text-sm text-muted-foreground">สรุปงานที่ต้องตามจากทุกเมนู ผลงานล่าสุด และยอดขาย — กดการ์ดเพื่อเข้าไปดูรายละเอียด</p>
        </div>
        <span className="rounded-full bg-gold px-3 py-1 text-xs font-extrabold text-[#5c4300]">ข้อมูลล่าสุด {formatFullDateLabel(data.todayDate)}</span>
      </div>

      <Section title="ต้องตามวันนี้" caption="เรียงตามความเร่งด่วน — สีแดง = มีเรื่องเลยกำหนด/ผิดปกติ · เหลือง = รอดำเนินการ · เขียว = ไม่มีค้าง · — = อ่านข้อมูลไม่ได้">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatusTile
            tone={attentionTone(overdue)}
            icon={ListChecks}
            label="งานค้างเลยกำหนด"
            count={overdue}
            unit="รายการ"
            sub={focusOk ? `ครบกำหนดวันนี้ ${num(dueToday ?? 0)} · ค้างนานสุด ${num(oldestBacklog ?? 0)} วัน` : "อ่านชีตงานค้างไม่ได้"}
            active={false}
            onClick={() => navigate("backlog")}
          />
          <StatusTile
            tone={cancelledTotals === null ? "neutral" : cancelledTotals.mismatch > 0 || cancelledTotals.stale > 0 ? "danger" : cancelledTotals.pending > 0 ? "warn" : "ok"}
            icon={Ban}
            label={`ยกเลิกค้างเกิน ${DEFAULT_STALE_DAYS} วัน`}
            count={cancelledTotals ? cancelledTotals.stale : null}
            unit="รายการ"
            sub={cancelledTotals ? `ไม่ตรง ${num(cancelledTotals.mismatch)} · รอตรวจสอบ ${num(cancelledTotals.pending)}` : "อ่านชีตสินค้ายกเลิกไม่ได้"}
            active={false}
            onClick={() => navigate("cancelled")}
          />
          <StatusTile
            tone={notStockedIn === null ? "neutral" : notStockedIn > 0 ? "danger" : restockTotals && restockTotals.rows > 0 ? "warn" : "ok"}
            icon={PackageX}
            label="ตีกลับที่ยังไม่เข้าสต็อก"
            count={restockTotals ? restockTotals.rows : null}
            unit="แถว"
            sub={restockTotals ? `ไม่ Stock-In ${num(notStockedIn ?? 0)} แถว · สูญหาย ${num(lostRows ?? 0)} แถว` : "อ่านชีต cn-restock ไม่ได้"}
            active={false}
            onClick={() => navigate("returns")}
          />
          <StatusTile
            tone={attentionTone(unpaid ? unpaid.rows : null, "warn")}
            icon={Banknote}
            label="รอเงินคืนจากขนส่ง"
            count={unpaid ? unpaid.rows : null}
            unit="เคส"
            sub={unpaid ? `มูลค่าสินค้า ${baht(unpaid.sellPrice)} · ${num(unpaid.orders)} ออเดอร์` : "อ่านชีตเงินคืนไม่ได้"}
            active={false}
            onClick={() => navigate("returns")}
          />
          <StatusTile
            tone={openIssues > 0 ? "warn" : "ok"}
            icon={ClipboardCheck}
            label="ปัญหาหน้างานที่ยังไม่ปิด"
            count={openIssues}
            unit="รายการ"
            sub="จากแท็บ ปัญหารอแก้"
            active={false}
            onClick={() => navigate("work-issues")}
          />
          <StatusTile
            tone={belowTargetCount > 0 ? "warn" : "ok"}
            icon={Users}
            label={`พนักงานต่ำกว่าเป้า (ฝ่าย${teamLabel})`}
            count={belowTargetCount}
            unit="คน"
            sub="เรียงรายชื่อตามความเสี่ยงอยู่ด้านล่าง"
            active={false}
            onClick={() => navigate(`team-${selectedTeam}`)}
          />
        </div>
      </Section>

      <Section
        title={`ผลงานล่าสุด · ฝ่าย${teamLabel}`}
        caption={`จำนวนพัสดุ/ชิ้นงานที่ฝ่าย${teamLabel}ทำได้เทียบเป้า — สลับฝ่ายโดยเข้าเมนู ฝ่ายออนไลน์/ฝ่ายออฟไลน์`}
        goTo={`team-${selectedTeam}`}
        goLabel={`เปิดฝ่าย${teamLabel}`}
      >
        <div className="grid grid-cols-12 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="relative col-span-12 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 p-5 text-white shadow-[0_8px_28px_rgba(43,168,162,0.30)] lg:col-span-8"
          >
            {/* Fanned translucent cards — the Flip7 packaging motif. */}
            <div className="pointer-events-none absolute -right-6 -top-8 hidden sm:block" aria-hidden>
              {[-24, -12, 0, 12, 24].map((deg, i) => (
                <span
                  key={deg}
                  className="absolute right-0 top-0 h-40 w-28 origin-bottom rounded-2xl bg-white/10 ring-1 ring-white/20"
                  style={{ transform: `translateX(${-i * 30}px) rotate(${deg}deg)` }}
                />
              ))}
            </div>
            <div className="relative">
              <div className="flex items-center gap-1.5 text-sm font-bold text-white/90">
                <PackageCheck className="size-4" /> พัสดุที่ทำได้ · {formatFullDateLabel(data.todayDate)}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
                <HeroParcels value={today.parcels} />
                <span className="pb-1 text-base font-semibold text-white/85">พัสดุ</span>
                <span className="pb-1"><TrendBadge value={parcelTrend} /></span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4 border-t border-dashed border-white/40 pt-4">
                <HeroStat label="ชิ้นงานวันนี้" value={today.items} suffix="ชิ้น" />
                <div>
                  <p className="text-xs text-white/75">เทรนด์ชิ้นงาน</p>
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
            <div className="mb-3 flex items-center gap-1.5 self-start text-sm font-bold text-foreground">
              <Target className="size-4" /> อัตราถึงเป้า
            </div>
            <TargetRing percent={targetPct} label={targetLabel} />
          </motion.div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile tone="neutral" icon={CalendarRange} label="พัสดุเดือนนี้" value={<>{num(data.monthlyTotals.parcels)} <span className="text-sm font-semibold text-muted-foreground">พัสดุ</span></>} />
          <StatTile tone="neutral" icon={PackagePlus} label="ชิ้นงานเดือนนี้" value={<>{num(data.monthlyTotals.items)} <span className="text-sm font-semibold text-muted-foreground">ชิ้น</span></>} />
          <StatTile
            tone={errorsThisMonth > 0 ? "danger" : "ok"}
            icon={AlertTriangle}
            label="ข้อผิดพลาด (เดือนนี้)"
            value={<>{num(errorsThisMonth)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></>}
          />
          <StatTile
            tone={returnsThisMonth > 0 ? "warn" : "ok"}
            icon={RotateCcw}
            label="ตีกลับ / CN (เดือนนี้)"
            value={<>{num(returnsThisMonth)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></>}
          />
        </div>

        {hasOtData && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile tone="neutral" icon={Clock} label="OT วันนี้" value={<>{otToday.totalHours.toFixed(1)} <span className="text-sm font-semibold text-muted-foreground">ชม.</span></>} />
            <StatTile tone="neutral" icon={CalendarClock} label="OT เดือนนี้" value={<>{otMonth.totalHours.toFixed(1)} <span className="text-sm font-semibold text-muted-foreground">ชม.</span></>} />
            <StatTile tone="neutral" icon={Users} label="พนักงาน OT เดือนนี้" value={<>{num(otMonth.employeeCount)} <span className="text-sm font-semibold text-muted-foreground">คน</span></>} />
            <StatTile
              tone={otMonth.pendingCount > 0 ? "warn" : "ok"}
              icon={FileText}
              label="OT รออนุมัติ"
              value={<>{num(otMonth.pendingCount)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></>}
            />
          </div>
        )}
      </Section>

      {(rwSummaries.warehouse || rwSummaries.receiving) && (
        <Section title="ฝ่ายคลัง และ ฝ่ายรับเข้า" caption="ข้อมูลจากแท็บ รับเข้า+คลัง ที่ทีมกรอกเอง — ดูว่าวันนี้มาทำงานกี่คน และหมวด KPI ไหนที่ไม่มีคนกรอกแล้ว">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {rwSummaries.warehouse && (
              <DepartmentCard summary={summarizeRwDepartment(rwSummaries.warehouse, data.todayDate)} goTo="team-warehouse" icon={Warehouse} />
            )}
            {rwSummaries.receiving && (
              <DepartmentCard summary={summarizeRwDepartment(rwSummaries.receiving, data.todayDate)} goTo="team-receiving" icon={PackageOpen} />
            )}
          </div>
        </Section>
      )}

      {salesSnapshot && (
        <Section
          title={`ยอดขาย · ${formatMonthLabel(salesSnapshot.monthKey)}`}
          caption="ออนไลน์ + ออฟไลน์ รวมกัน ตั้งแต่ต้นเดือนถึงวันล่าสุดที่มีข้อมูล"
          goTo="sales-summary"
          goLabel="เปิดหน้ายอดขาย"
        >
          {daysBetween(salesSnapshot.lastDate, data.todayDate) > 3 && (
            <div>
              <StatusPill tone="warn" icon={Clock}>
                ข้อมูลยอดขายล่าสุดวันที่ {formatFullDateLabel(salesSnapshot.lastDate)} (ช้ากว่าวันนี้ {num(daysBetween(salesSnapshot.lastDate, data.todayDate))} วัน)
              </StatusPill>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              tone="ok"
              icon={Coins}
              label="ยอดขายสุทธิ (หลังหักคืนเงิน)"
              value={baht(salesSnapshot.totals.totalEffSales - salesSnapshot.totals.totalRefundAmount)}
              sub={`ยอดขายมีผล ${baht(salesSnapshot.totals.totalEffSales)}`}
            />
            <StatTile
              tone="neutral"
              icon={ShoppingCart}
              label="คำสั่งซื้อที่มีผล"
              value={<>{num(salesSnapshot.totals.totalEffOrders)} <span className="text-sm font-semibold text-muted-foreground">ออเดอร์</span></>}
              sub={`AOV ฿${salesSnapshot.totals.weightedAov.toFixed(2)}`}
            />
            <StatTile
              tone="warn"
              icon={RotateCcw}
              label="ยอดคืนเงิน"
              value={baht(salesSnapshot.totals.totalRefundAmount)}
              sub={`ยกเลิก ${num(salesSnapshot.totals.totalCancelledOrders)} ออเดอร์ (${salesSnapshot.totals.cancelRate.toFixed(1)}%)`}
            />
            <StatTile
              tone="info"
              icon={Layers}
              label="สัดส่วน ออนไลน์ / ออฟไลน์"
              value={(() => {
                const o = salesSnapshot.comparison.online.totalEffSales
                const f = salesSnapshot.comparison.offline.totalEffSales
                const share = o + f > 0 ? (o / (o + f)) * 100 : 0
                return `${share.toFixed(0)} / ${(100 - share).toFixed(0)}`
              })()}
              sub={`ออนไลน์ ${baht(salesSnapshot.comparison.online.totalEffSales)} · ออฟไลน์ ${baht(salesSnapshot.comparison.offline.totalEffSales)}`}
            />
          </div>
        </Section>
      )}

      <Section
        title="พนักงานที่ต้องติดตาม และผลงานย้อนหลัง"
        caption={`ฝ่าย${teamLabel} — ใครต่ำกว่าเป้า และผลงานจริงเทียบเป้า 14 วันล่าสุด`}
        goTo={`team-${selectedTeam}`}
        goLabel="ดูพนักงานทั้งหมด"
      >
        <ReportSection emoji="🚨" title="พนักงานที่ต้องติดตาม" subtitle={`เรียงจากความเสี่ยงสูงไปต่ำ — แสดง ${Math.min(FOLLOW_UP_LIMIT, followUpRows.length)} คนแรกจากทั้งหมด ${followUpRows.length} คน ดูครบที่เมนูฝ่าย${teamLabel}`}>
          <EmployeeTable rows={followUpRows.slice(0, FOLLOW_UP_LIMIT)} onRowClick={openEmployeeDetail} searchable emptyMessage="ไม่มีพนักงานในทีมที่เลือก" />
        </ReportSection>

        <ChartCard
          emoji="📊"
          title="ผลงานจริงเทียบเป้า"
          subtitle="พัสดุ / สินค้า รายวัน เทียบเป้าทีม (ปรับตามจำนวนคนที่ทำงานจริงวันนั้น)"
          actions={<ChartChip>{recentWindow.dates.length} วันล่าสุด</ChartChip>}
        >
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
              leftAxisName="(พัสดุ / ชิ้น)"
              rightAxisName="(เป้าทีม)"
              height={300}
            />
          </Suspense>
        </ChartCard>
      </Section>

      <Collapsible title="รายละเอียดเชิงลึกของทีม" caption="อันดับรายวัน ตารางผลผลิต สถานะหมวดงาน กิจกรรมล่าสุด ภาระงานพนักงาน และ SLA ร้านค้า — กดเพื่อเปิด">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
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
            <CategoryReportPanel data={data} />
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
      </Collapsible>
    </div>
  )
}
