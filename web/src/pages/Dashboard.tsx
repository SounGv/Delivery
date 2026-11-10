import { lazy, Suspense, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Ban,
  Banknote,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FileText,
  ListChecks,
  Minus,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  PackageX,
  RotateCcw,
  Users,
  Warehouse,
} from "lucide-react"
import { useCancelledQuery, useFocusQuery, useRefundsQuery, useRestockQuery, useStockValueQuery, useTeamDashboard } from "@/api/queries"
import type { Employee } from "@/api/types"
import { useEmployeeDetail } from "@/lib/employeeDetailStore"
import { StatusPill, type Tone } from "@/components/returns/ReturnsUi"
import { CategoryStatusPanel } from "@/components/charts/CategoryStatusPanel"
import { EmployeeWorkloadPanel } from "@/components/charts/EmployeeWorkloadPanel"
import { CategoryReportPanel } from "@/components/reports/CategoryReportPanel"
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel"
import { AttentionList, type AttentionItem } from "@/components/dashboard/AttentionList"
import { StockSnapshotPanel } from "@/components/dashboard/StockSnapshotPanel"
import { OverviewHero } from "@/components/dashboard/OverviewHero"
import { ChartCard, ChartChip } from "@/components/charts/ChartCard"
import { ReportSection } from "@/components/common/ReportSection"
import { FollowUpList } from "@/components/dashboard/FollowUpList"
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
import { summarizeStockValue } from "@/lib/stock-value-selectors"
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

/** Up/down/flat pill for day-over-day change. Green = up, red = down, grey = flat; the arrow carries it without colour. */
function TrendPill({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">— ไม่มีข้อมูลเทียบ{label}</span>
  const flat = Math.abs(value) < 0.05
  const tone: Tone = flat ? "neutral" : value > 0 ? "ok" : "danger"
  const Icon = flat ? Minus : value > 0 ? ArrowUp : ArrowDown
  return (
    <StatusPill tone={tone} icon={Icon}>
      {Math.abs(value).toFixed(1)}% <span className="font-normal opacity-80">{label}</span>
    </StatusPill>
  )
}

/** A number that counts up when it first appears. Isolated so the animation hook never sits behind
 * Dashboard's loading/error early-returns (rules of hooks). */
function AnimatedValue({ value, className }: { value: number; className?: string }) {
  const animated = useAnimatedNumber(value)
  return <span className={className}>{Math.round(animated).toLocaleString("th-TH")}</span>
}

/** Circular progress ring for target achievement. */
function TargetRing({ percent, label, size = 132 }: { percent: number | null; label?: string; size?: number }) {
  const clamped = Math.max(0, Math.min(100, percent ?? 0))
  const animated = useAnimatedNumber(clamped)
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
          <h2 className="page-heading text-xl font-extrabold text-foreground">{title}</h2>
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

const MONTH_STATE: Record<Exclude<Tone, "info" | "neutral">, { word: string; icon: React.ComponentType<{ className?: string }> }> = {
  ok: { word: "ไม่มี", icon: CheckCircle2 },
  warn: { word: "ต้องดู", icon: Clock },
  danger: { word: "ต้องดู", icon: AlertTriangle },
}

/** One cell of the month strip: a label, one number, and (only when it matters) a status pill. */
function MonthCell({
  icon: Icon,
  label,
  value,
  unit,
  tone,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  unit: string
  tone?: "ok" | "warn" | "danger"
  sub?: string
}) {
  const state = tone ? MONTH_STATE[tone] : null
  return (
    <div className="border-b border-border/60 p-4 lg:border-b-0">
      <p className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
        <Icon className="size-4" /> {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">
        {value} <span className="text-sm font-semibold text-muted-foreground">{unit}</span>
      </p>
      {state && tone && (
        <div className="mt-1">
          <StatusPill tone={tone} icon={state.icon} small>
            {state.word}
          </StatusPill>
        </div>
      )}
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

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
  const stockQuery = useStockValueQuery()

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

  const attentionItems: AttentionItem[] = [
    {
      key: "backlog",
      tone: attentionTone(overdue),
      icon: ListChecks,
      label: "งานค้างเลยกำหนด",
      count: overdue,
      unit: "รายการ",
      sub: focusOk ? `ครบกำหนดวันนี้ ${num(dueToday ?? 0)} · ค้างนานสุด ${num(oldestBacklog ?? 0)} วัน` : "อ่านชีตงานค้างไม่ได้",
      onOpen: () => navigate("backlog"),
    },
    {
      key: "cancelled",
      tone: cancelledTotals === null ? "neutral" : cancelledTotals.mismatch > 0 || cancelledTotals.stale > 0 ? "danger" : cancelledTotals.pending > 0 ? "warn" : "ok",
      icon: Ban,
      label: `ยกเลิกค้างเกิน ${DEFAULT_STALE_DAYS} วัน`,
      count: cancelledTotals ? cancelledTotals.stale : null,
      unit: "รายการ",
      sub: cancelledTotals ? `ไม่ตรง ${num(cancelledTotals.mismatch)} · รอตรวจสอบ ${num(cancelledTotals.pending)}` : "อ่านชีตสินค้ายกเลิกไม่ได้",
      onOpen: () => navigate("cancelled"),
    },
    {
      key: "restock",
      tone: notStockedIn === null ? "neutral" : notStockedIn > 0 ? "danger" : restockTotals && restockTotals.rows > 0 ? "warn" : "ok",
      icon: PackageX,
      label: "ตีกลับที่ยังไม่เข้าสต็อก",
      count: restockTotals ? restockTotals.rows : null,
      unit: "แถว",
      sub: restockTotals ? `ไม่ Stock-In ${num(notStockedIn ?? 0)} แถว · สูญหาย ${num(lostRows ?? 0)} แถว` : "อ่านชีต cn-restock ไม่ได้",
      onOpen: () => navigate("returns"),
    },
    {
      key: "refunds",
      tone: attentionTone(unpaid ? unpaid.rows : null, "warn"),
      icon: Banknote,
      label: "รอเงินคืนจากขนส่ง",
      count: unpaid ? unpaid.rows : null,
      unit: "เคส",
      sub: unpaid ? `มูลค่าสินค้า ${baht(unpaid.sellPrice)} · ${num(unpaid.orders)} ออเดอร์` : "อ่านชีตเงินคืนไม่ได้",
      onOpen: () => navigate("returns"),
    },
    {
      key: "work-issues",
      tone: openIssues > 0 ? "warn" : "ok",
      icon: ClipboardCheck,
      label: "ปัญหาหน้างานที่ยังไม่ปิด",
      count: openIssues,
      unit: "รายการ",
      sub: "จากแท็บ ปัญหารอแก้",
      onOpen: () => navigate("work-issues"),
    },
    {
      key: "below-target",
      tone: belowTargetCount > 0 ? "warn" : "ok",
      icon: Users,
      label: `พนักงานต่ำกว่าเป้า (ฝ่าย${teamLabel})`,
      count: belowTargetCount,
      unit: "คน",
      sub: "ดูรายชื่อเรียงตามความเสี่ยงด้านล่างของหน้านี้",
      onOpen: () => navigate(`team-${selectedTeam}`),
    },
  ]
  // Red or amber = a person has to do something today.
  const needAction = attentionItems.filter((i) => i.tone === "danger" || i.tone === "warn").length

  const stockReport = stockQuery.data?.stockValue
  const stockSnapshot = stockReport && !stockReport.error ? summarizeStockValue(stockReport, Date.now()) : null

  const netSales = salesSnapshot ? salesSnapshot.totals.totalEffSales - salesSnapshot.totals.totalRefundAmount : 0
  const onlineShare = salesSnapshot
    ? (() => {
        const o = salesSnapshot.comparison.online.totalEffSales
        const f = salesSnapshot.comparison.offline.totalEffSales
        return o + f > 0 ? (o / (o + f)) * 100 : 0
      })()
    : 0

  return (
    <div className="space-y-8">
      {/* 1. The dominant block: title, one verdict, and the four numbers a manager looks for first. */}
      <OverviewHero
        dataDateLabel={formatFullDateLabel(data.todayDate)}
        dayLabel={formatDateLabel(data.todayDate)}
        needAction={needAction}
        teamLabel={teamLabel}
        parcels={today.parcels}
        parcelTrend={parcelTrend}
        activeEmployees={today.activeEmployees}
        targetPct={targetPct}
        targetLabel={targetLabel}
        sales={
          salesSnapshot
            ? {
                net: netSales,
                monthLabel: formatMonthLabel(salesSnapshot.monthKey),
                note:
                  daysBetween(salesSnapshot.lastDate, data.todayDate) > 3
                    ? `ข้อมูลถึง ${formatFullDateLabel(salesSnapshot.lastDate)}`
                    : "หลังหักคืนเงิน",
              }
            : null
        }
        stockTotal={stockSnapshot ? stockSnapshot.total : null}
        onOpenTeam={() => navigate(`team-${selectedTeam}`)}
        onOpenSales={() => navigate("sales-summary")}
        onOpenStock={() => navigate("stock-value")}
      />

      {/* 2. First screen: what needs a person (left) and how today's output looks (right). */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7">
          <Section title="ต้องตามวันนี้" caption="เรียงจากเร่งด่วนสุดไปน้อยสุด · กดแถวเพื่อเข้าเมนูนั้น">
            <AttentionList items={attentionItems} />
          </Section>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <Section title={`ผลงานวันนี้ · ฝ่าย${teamLabel}`} goTo={`team-${selectedTeam}`} goLabel="เปิดฝ่าย">
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                    <PackageCheck className="size-4" /> พัสดุที่ทำได้ · {formatDateLabel(data.todayDate)}
                  </p>
                  <p className="mt-1 text-5xl font-extrabold leading-none tabular-nums text-foreground">
                    <AnimatedValue value={today.parcels} />
                    <span className="ml-2 text-base font-semibold text-muted-foreground">พัสดุ</span>
                  </p>
                  <div className="mt-3">
                    <TrendPill value={parcelTrend} label="เทียบวันก่อน" />
                  </div>
                </div>
                <TargetRing percent={targetPct} label={targetLabel} size={116} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-dashed border-border pt-4">
                <div>
                  <dt className="text-xs text-muted-foreground">ชิ้นงานวันนี้</dt>
                  <dd className="text-xl font-extrabold tabular-nums text-foreground">
                    <AnimatedValue value={today.items} /> <span className="text-sm font-semibold text-muted-foreground">ชิ้น</span>
                  </dd>
                  <dd className="mt-1"><TrendPill value={itemTrend} label="เทียบวันก่อน" /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">พนักงานที่ทำงาน</dt>
                  <dd className="text-xl font-extrabold tabular-nums text-foreground">
                    <AnimatedValue value={today.activeEmployees} /> <span className="text-sm font-semibold text-muted-foreground">คน</span>
                  </dd>
                </div>
              </dl>
            </div>
          </Section>
        </div>
      </div>

      {/* 3. The month on one strip instead of a dozen tiles. */}
      <Section title={`เดือนนี้ · ${formatMonthLabel(monthKey)}`} caption="ยอดสะสมตั้งแต่ต้นเดือน — รายการที่มีป้ายสถานะคือเรื่องที่ควรเปิดดู">
        <div className="glass-panel grid grid-cols-2 divide-border/60 overflow-hidden rounded-2xl md:grid-cols-3 lg:grid-cols-6 lg:divide-x">
          <MonthCell icon={CalendarRange} label="พัสดุ" value={num(data.monthlyTotals.parcels)} unit="พัสดุ" />
          <MonthCell icon={PackagePlus} label="ชิ้นงาน" value={num(data.monthlyTotals.items)} unit="ชิ้น" />
          <MonthCell icon={AlertTriangle} label="ข้อผิดพลาด" value={num(errorsThisMonth)} unit="รายการ" tone={errorsThisMonth > 0 ? "danger" : "ok"} />
          <MonthCell icon={RotateCcw} label="ตีกลับ / CN" value={num(returnsThisMonth)} unit="รายการ" tone={returnsThisMonth > 0 ? "warn" : "ok"} />
          {hasOtData && (
            <>
              <MonthCell icon={Clock} label="OT สะสม" value={otMonth.totalHours.toFixed(1)} unit="ชม." sub={`วันนี้ ${otToday.totalHours.toFixed(1)} ชม. · ${num(otMonth.employeeCount)} คน`} />
              <MonthCell icon={FileText} label="OT รออนุมัติ" value={num(otMonth.pendingCount)} unit="รายการ" tone={otMonth.pendingCount > 0 ? "warn" : "ok"} />
            </>
          )}
        </div>
      </Section>

      {/* 4. Money and stock side by side. */}
      {(salesSnapshot || stockSnapshot) && (
        <div className="grid grid-cols-12 gap-6">
          {salesSnapshot && (
            <div className={cn("col-span-12", stockSnapshot && "lg:col-span-7")}>
              <Section
                title={`ยอดขาย · ${formatMonthLabel(salesSnapshot.monthKey)}`}
                caption="ออนไลน์ + ออฟไลน์ รวมกัน ตั้งแต่ต้นเดือนถึงวันล่าสุดที่มีข้อมูล"
                goTo="sales-summary"
                goLabel="เปิดหน้ายอดขาย"
              >
                <div className="glass-panel rounded-2xl p-5">
                  {daysBetween(salesSnapshot.lastDate, data.todayDate) > 3 && (
                    <div className="mb-3">
                      <StatusPill tone="warn" icon={Clock}>
                        ข้อมูลล่าสุดวันที่ {formatFullDateLabel(salesSnapshot.lastDate)} (ช้ากว่าวันนี้ {num(daysBetween(salesSnapshot.lastDate, data.todayDate))} วัน)
                      </StatusPill>
                    </div>
                  )}
                  <p className="text-sm font-bold text-muted-foreground">ยอดขายสุทธิ (หลังหักคืนเงิน)</p>
                  <p className="text-4xl font-extrabold tabular-nums text-foreground">{baht(netSales)}</p>
                  <p className="text-xs text-muted-foreground">ยอดขายมีผล {baht(salesSnapshot.totals.totalEffSales)}</p>

                  <div className="mt-4">
                    <div className="flex justify-between gap-2 text-xs font-semibold text-foreground">
                      <span>ออนไลน์ {onlineShare.toFixed(0)}% · {baht(salesSnapshot.comparison.online.totalEffSales)}</span>
                      <span>ออฟไลน์ {(100 - onlineShare).toFixed(0)}% · {baht(salesSnapshot.comparison.offline.totalEffSales)}</span>
                    </div>
                    <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${onlineShare}%` }} />
                      <div className="h-full bg-amber-400" style={{ width: `${100 - onlineShare}%` }} />
                    </div>
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-dashed border-border pt-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">คำสั่งซื้อที่มีผล</dt>
                      <dd className="text-xl font-extrabold tabular-nums text-foreground">{num(salesSnapshot.totals.totalEffOrders)}</dd>
                      <dd className="text-xs text-muted-foreground">AOV ฿{salesSnapshot.totals.weightedAov.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">ยอดคืนเงิน</dt>
                      <dd className="text-xl font-extrabold tabular-nums text-foreground">{baht(salesSnapshot.totals.totalRefundAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">ยกเลิก</dt>
                      <dd className="text-xl font-extrabold tabular-nums text-foreground">{num(salesSnapshot.totals.totalCancelledOrders)}</dd>
                      <dd className="text-xs text-muted-foreground">{salesSnapshot.totals.cancelRate.toFixed(1)}% ของออเดอร์</dd>
                    </div>
                  </dl>
                </div>
              </Section>
            </div>
          )}
          {stockSnapshot && (
            <div className={cn("col-span-12", salesSnapshot && "lg:col-span-5")}>
              <Section title="มูลค่าสต็อก" caption="ราคาต้นทุน × จำนวนคงเหลือ แยกตามคลัง" goTo="stock-value" goLabel="เปิดหน้ามูลค่าสต็อก">
                <StockSnapshotPanel snapshot={stockSnapshot} />
              </Section>
            </div>
          )}
        </div>
      )}

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

      {/* 5. People to follow up and the 14-day trend. */}
      <Section
        title="พนักงานที่ต้องติดตาม และผลงานย้อนหลัง"
        caption={`ฝ่าย${teamLabel} — ใครต่ำกว่าเป้า และผลงานจริงเทียบเป้า 14 วันล่าสุด`}
        goTo={`team-${selectedTeam}`}
        goLabel="ดูพนักงานทั้งหมด"
      >
        <ReportSection emoji="🚨" title="พนักงานที่ต้องติดตาม" subtitle={`เรียงจากความเสี่ยงสูงไปต่ำ — แสดง ${Math.min(FOLLOW_UP_LIMIT, followUpRows.length)} คนแรกจากทั้งหมด ${followUpRows.length} คน ดูครบที่เมนูฝ่าย${teamLabel}`}>
          <FollowUpList
            allRows={followUpRows}
            limit={FOLLOW_UP_LIMIT}
            teamLabel={teamLabel}
            onOpen={openEmployeeDetail}
            onViewAll={() => navigate(`team-${selectedTeam}`)}
          />
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
