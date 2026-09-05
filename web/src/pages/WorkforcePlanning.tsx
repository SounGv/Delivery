import { lazy, Suspense, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, PackageCheck, Target, TrendingUp, Users } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Skeleton } from "@/components/ui/skeleton"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { Podium } from "@/components/workforce/Podium"
import { RankingList } from "@/components/workforce/RankingList"
import { filterEmployeeByDateRange, getDatePresets } from "@/lib/dashboard-selectors"
import {
  computeDailyOrderWorkforceSeries,
  computeDailyWorkforceSeries,
  computeEmployeeMetrics,
  computeRangeOrderWorkforceStat,
  computeRangeWorkforceStat,
  computeRankDeltas,
  previousWindow,
  rankByMetric,
  type RankedEmployeeMetric,
  type RankingMetric,
} from "@/lib/workforce"
import { formatFullDateLabel, formatNumber } from "@/lib/format"
import { useSettings } from "@/lib/settingsContext"
import { cn } from "@/lib/utils"

const WorkloadAnalyticsCharts = lazy(() =>
  import("@/components/workforce/WorkloadAnalyticsCharts").then((m) => ({ default: m.WorkloadAnalyticsCharts }))
)
const RankTrendChart = lazy(() =>
  import("@/components/charts/RankTrendChart").then((m) => ({ default: m.RankTrendChart }))
)

const METRIC_OPTIONS: { key: RankingMetric; label: string }[] = [
  { key: "parcels", label: "พัสดุ" },
  { key: "items", label: "สินค้า" },
  { key: "productivity", label: "Productivity" },
  { key: "pctTarget", label: "% Target" },
]

function metricFormatter(metric: RankingMetric) {
  return (m: RankedEmployeeMetric) => {
    if (metric === "parcels") return `${formatNumber(m.parcels)} พัสดุ`
    if (metric === "items") return `${formatNumber(m.items)} ชิ้น`
    if (metric === "productivity") return `${formatNumber(Math.round(m.productivity))} พัสดุ/วัน`
    return `${(m.pctTarget ?? 0).toFixed(0)}% ของเป้า`
  }
}

function statusMeta(status: "ok" | "watch" | "shortage", gap: number) {
  if (status === "shortage") return { emoji: "🔴", label: `ขาด ${gap} คน`, tone: "text-destructive", bg: "bg-destructive/15" }
  if (status === "watch") return { emoji: "🟡", label: `เกินความจำเป็น ${-gap} คน`, tone: "text-amber-500", bg: "bg-amber-500/15" }
  return { emoji: "🟢", label: "กำลังคนพอดี", tone: "text-emerald-glow", bg: "bg-emerald-glow/15" }
}

export function WorkforcePlanning() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const { targetOverride, offlineOrderTarget, selectedTeam } = useSettings()
  const isOfflineTeam = selectedTeam === "offline"
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("parcels")

  const sortedDates = useMemo(() => (data ? [...data.dates].sort() : []), [data])

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const presets = getDatePresets(data.todayDate, sortedDates[0] ?? data.todayDate)
  const quickPresets = ["วันนี้", "7 วันล่าสุด", "เดือนนี้"].map((label) => presets.find((p) => p.label === label)!)

  const effectiveStart = startDate || data.todayDate
  const effectiveEnd = endDate || data.todayDate
  const isActivePreset = (p: { start: string; end: string }) => p.start === effectiveStart && p.end === effectiveEnd

  // No `?? 350` fallback here: 350 is the ONLINE team's per-person target. A team
  // without its own numeric target in the sheet (e.g. offline before one is set)
  // must show as "no target", not silently get scored against the online number.
  const targetPerPerson = targetOverride ?? data.target?.value ?? null
  // Per-employee ranking/status is always about parcels/items — the only data
  // tracked per person — regardless of which team is selected.
  const hasParcelTarget = targetPerPerson !== null
  const effectiveMetric = hasParcelTarget ? rankingMetric : rankingMetric === "pctTarget" ? "parcels" : rankingMetric

  // Offline is wholesale — headcount planning (this-section only) is measured by
  // ORDER count, not parcels, per ops (a parcel target doesn't reflect their workload).
  // Online (and any other team) keeps planning by the parcel target, unchanged.
  const planTarget = isOfflineTeam ? offlineOrderTarget : targetPerPerson
  const hasPlanTarget = planTarget !== null
  const workloadLabel = isOfflineTeam ? "ออเดอร์" : "พัสดุ"
  const workloadUnit = isOfflineTeam ? "ออเดอร์/คน" : "พัสดุ/คน"

  const rangeStat = isOfflineTeam
    ? computeRangeOrderWorkforceStat(data, effectiveStart, effectiveEnd, planTarget ?? 0)
    : computeRangeWorkforceStat(data, effectiveStart, effectiveEnd, planTarget ?? 0)
  const rangeWorkload = "totalOrders" in rangeStat ? rangeStat.totalOrders : rangeStat.totalParcels

  const employeeMetrics = computeEmployeeMetrics(data.employees, effectiveStart, effectiveEnd, targetPerPerson ?? 0)
  const ranking = rankByMetric(employeeMetrics, effectiveMetric)
  const top3 = ranking.filter((m) => m.rank <= 3)
  const rest = ranking.filter((m) => m.rank > 3)

  const prev = previousWindow(effectiveStart, effectiveEnd)
  const prevMetrics = computeEmployeeMetrics(data.employees, prev.start, prev.end, targetPerPerson ?? 0)
  const prevRanking = rankByMetric(prevMetrics, effectiveMetric)
  const rankDeltas = computeRankDeltas(ranking, prevRanking)

  const rangeDates = sortedDates.filter((d) => d >= effectiveStart && d <= effectiveEnd)
  const dailySeries = computeDailyWorkforceSeries(data, rangeDates, targetPerPerson ?? 0)
  const planSeries = isOfflineTeam
    ? computeDailyOrderWorkforceSeries(data, rangeDates, planTarget ?? 0)
    : computeDailyWorkforceSeries(data, rangeDates, planTarget ?? 0)

  const status = statusMeta(rangeStat.status, rangeStat.gap)
  const formatMetric = metricFormatter(rankingMetric)

  return (
    <div className="space-y-4">
      {/* Header + date filter */}
      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border p-1">
          {quickPresets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setStartDate(p.start)
                setEndDate(p.end)
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isActivePreset(p) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground">เลือกช่วงเวลา</label>
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
        <p className="ml-auto text-xs text-muted-foreground">
          {formatFullDateLabel(effectiveStart)} - {formatFullDateLabel(effectiveEnd)}
        </p>
      </div>

      {/* Section 1: KPI summary */}
      <div className={cn("grid grid-cols-2 gap-3", hasPlanTarget ? "sm:grid-cols-5" : "sm:grid-cols-3")}>
        <KpiCard title={workloadLabel} value={rangeWorkload} icon={PackageCheck} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix={workloadLabel} />
        <KpiCard title="ทำงานจริง" value={rangeStat.currentHeadcount} icon={Users} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="คน" />
        {hasPlanTarget && (
          <>
            <KpiCard title="ควรใช้" value={rangeStat.requiredHeadcount} icon={Target} gradient="bg-gradient-to-br from-amber-500 to-amber-600" suffix="คน" />
            <KpiCard
              title={rangeStat.gap > 0 ? "ขาด" : rangeStat.gap < 0 ? "เกิน" : "พอดี"}
              value={Math.abs(rangeStat.gap)}
              icon={rangeStat.gap > 0 ? AlertTriangle : CheckCircle2}
              gradient={rangeStat.gap > 0 ? "bg-gradient-to-br from-rose-500 to-destructive" : "bg-gradient-to-br from-emerald-glow to-brand-600"}
              suffix="คน"
            />
          </>
        )}
        <KpiCard
          title="Productivity/คน"
          value={rangeStat.actualProductivity}
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-emerald-glow to-brand-600"
          formatValue={(n) => n.toFixed(0)}
          suffix={workloadUnit}
        />
      </div>

      {hasPlanTarget ? (
        <div className={cn("glass-panel flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold", status.bg, status.tone)}>
          <span className="text-lg leading-none">{status.emoji}</span>
          {rangeStat.status === "shortage" && "กำลังคนไม่เพียงพอ — "}
          {rangeStat.status === "watch" && "ควรเฝ้าระวัง — "}
          {rangeStat.status === "ok" && "กำลังคนเพียงพอ — "}
          {status.label}
        </div>
      ) : (
        <div className="glass-panel flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold text-sky-400">
          <span className="text-lg leading-none">ℹ️</span>
          {isOfflineTeam
            ? "ฝ่ายนี้ยังไม่ได้ตั้งเป้าออเดอร์/คน — ตั้งได้ที่หน้า Settings เพื่อคำนวณกำลังคนที่ควรใช้"
            : "ฝ่ายนี้ยังไม่มีเป้าต่อคนในชีท — แสดงได้เฉพาะยอดงานจริงและอันดับผลงาน ไม่สามารถคำนวณกำลังคนที่ควรใช้ได้"}
        </div>
      )}

      {/* Section 2: Workforce planning breakdown */}
      {hasPlanTarget && (
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Target className="size-4 text-brand-400" /> Workforce Planning
          </h3>
          <p className="text-xs text-muted-foreground">
            จำนวนคนที่ควรใช้ = CEILING({workloadLabel}ทั้งหมด ÷ Target Productivity) = CEILING({formatNumber(rangeWorkload)} ÷ {planTarget}) ={" "}
            <span className="font-semibold text-foreground">{rangeStat.requiredHeadcount} คน</span>
            <br />
            Actual Productivity = {workloadLabel}รวม ÷ พนักงานที่ทำงานจริง = {formatNumber(rangeWorkload)} ÷ {rangeStat.currentHeadcount} ={" "}
            <span className="font-semibold text-foreground">{Math.round(rangeStat.actualProductivity)} {workloadUnit}</span>{" "}
            (Planning Target: {planTarget} — ไม่นำ Actual มาเปลี่ยน Target ทันที ปรับ Target ได้ที่หน้า Settings)
          </p>
        </div>
      )}

      {/* Section 5: the two required Performance charts — actual-vs-target and
          rank-over-time. These are the primary analysis tools; the ranking
          table below is secondary/click-through, per the redesign spec. */}
      <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <WorkloadAnalyticsCharts series={dailySeries} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
        <RankTrendChart
          employees={data.employees.map((e) => filterEmployeeByDateRange(e, effectiveStart, effectiveEnd))}
          period="day"
        />
      </Suspense>

      {/* Section 6: full ranking — secondary, for drilling into an individual's numbers. */}
      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">อันดับผลงานรายบุคคล</h3>
          <div className="flex gap-1 rounded-xl border border-border p-1">
            {METRIC_OPTIONS.filter((opt) => hasParcelTarget || opt.key !== "pctTarget").map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRankingMetric(opt.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  effectiveMetric === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {top3.length > 0 ? (
          <Podium top3={top3} metricFormatter={formatMetric} showTarget={hasParcelTarget} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงเวลาที่เลือก</p>
        )}

        {rest.length > 0 && (
          <div className="mt-6">
            <RankingList entries={rest} rankDeltas={rankDeltas} metricFormatter={formatMetric} showTarget={hasParcelTarget} />
          </div>
        )}
      </div>

      {/* Section 7: Daily workforce table */}
      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Daily Workforce Calculation</h3>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">วันที่</th>
              <th className="pb-2 font-medium">{workloadLabel}</th>
              <th className="pb-2 font-medium">คนทำงานจริง</th>
              <th className="pb-2 font-medium">Productivity</th>
              {hasPlanTarget && (
                <>
                  <th className="pb-2 font-medium">Target</th>
                  <th className="pb-2 font-medium">ควรใช้</th>
                  <th className="pb-2 font-medium">ขาด/เกิน</th>
                  <th className="pb-2 font-medium">สถานะ</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {[...planSeries].reverse().map((d) => {
              const s = statusMeta(d.status, d.gap)
              const workload = "totalOrders" in d ? d.totalOrders : d.totalParcels
              return (
                <tr key={d.date} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-foreground">{d.date}</td>
                  <td className="py-2 text-muted-foreground">{formatNumber(workload)}</td>
                  <td className="py-2 text-muted-foreground">{d.activeEmployeeCount}</td>
                  <td className="py-2 text-muted-foreground">{Math.round(d.actualProductivity)}</td>
                  {hasPlanTarget && (
                    <>
                      <td className="py-2 text-muted-foreground">{d.target}</td>
                      <td className="py-2 text-muted-foreground">{d.requiredHeadcount}</td>
                      <td className="py-2 text-muted-foreground">{d.gap > 0 ? `ขาด ${d.gap}` : d.gap < 0 ? `เกิน ${-d.gap}` : "พอดี"}</td>
                      <td className={cn("py-2 font-medium", s.tone)}>
                        {s.emoji} {s.label}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {planSeries.length === 0 && (
              <tr>
                <td colSpan={hasPlanTarget ? 8 : 4} className="py-6 text-center text-muted-foreground">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Section 8-9: shift schedule context (informational only — the sheet has no intraday timestamps) */}
      <div className="glass-panel rounded-2xl p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Clock className="size-4 text-brand-400" /> ตารางกะการทำงาน
        </h3>
        <p className="text-xs text-muted-foreground">
          เวลางาน 09:00–18:00 · พักกลางวัน 1 ชั่วโมง · เวลาทำงานจริง 8 ชั่วโมง
          {hasPlanTarget && ` (เป้า ${planTarget} ${workloadUnit}/วัน คำนวณจากเวลาทำงานจริงนี้แล้ว ไม่ได้หักซ้ำ)`}
          <br />
          กะเช้า/งานส่งด่วน 08:30–09:00: ชีทข้อมูลปัจจุบันบันทึกเฉพาะยอดรวมรายวันต่อคน ไม่มีการบันทึกเวลาเข้า-ออกหรือแยกช่วงเวลาในแต่ละวัน จึงยังไม่สามารถคำนวณกำลังคนแยกตามช่วงเวลา/ชั่วโมงได้จากข้อมูลจริงในตอนนี้ —
          หากต้องการฟีเจอร์นี้ ต้องเพิ่มการบันทึกเวลาเข้า-ออกงานในชีทก่อน
        </p>
      </div>
    </div>
  )
}
