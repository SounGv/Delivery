import { useMemo, useState } from "react"
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, Download, Minus, PackageCheck, ScanLine, Truck, Users } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Podium } from "@/components/workforce/Podium"
import { RankingList } from "@/components/workforce/RankingList"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { ChartCard } from "@/components/charts/ChartCard"
import { BarLineChart } from "@/components/charts/BarLineChart"
import { computeRankDeltas, previousWindow, rankByMetric, type RankedEmployeeMetric, type RankingMetric } from "@/lib/workforce"
import {
  computeWpDailyComparison,
  computeWpDailyTrend,
  computeWpDailyTrendByDepartment,
  computeWpEmployeeMetrics,
  dailyItemTotal,
  dailyParcelTotal,
  dailyWaveTotal,
  sumEmployeeMetricInRange,
} from "@/lib/workPerformanceRanking"
import { downloadCsv } from "@/lib/csv"
import { getDatePresets } from "@/lib/dashboard-selectors"
import { formatFullDateLabel, formatNumber } from "@/lib/format"
import { useSettings } from "@/lib/settingsContext"
import { cn } from "@/lib/utils"
import type { WorkPerformanceEmployee, WorkPerformanceMetrics } from "@/api/types"

// "แอดมิน" (the shop-owner/admin BigSeller account, e.g. Rootbeer) isn't a real
// fulfilment worker — never a department to show, filter, or rank here.
const EXCLUDED_DEPARTMENTS = new Set(["แอดมิน"])
const DEPARTMENT_ORDER = ["ออนไลน์", "ออฟไลน์", "คลัง"]

const RANKING_METRIC_OPTIONS: { key: RankingMetric; label: string }[] = [
  { key: "parcels", label: "พัสดุ" },
  { key: "items", label: "สินค้า" },
  { key: "productivity", label: "Productivity" },
  { key: "pctTarget", label: "% Target" },
]

function rankingMetricFormatter(metric: RankingMetric) {
  return (m: RankedEmployeeMetric) => {
    if (metric === "parcels") return `${formatNumber(m.parcels)} พัสดุ`
    if (metric === "items") return `${formatNumber(m.items)} SKU`
    if (metric === "productivity") return `${formatNumber(Math.round(m.productivity))} พัสดุ/วัน`
    return `${(m.pctTarget ?? 0).toFixed(0)}% ของเป้า`
  }
}

/** Range-aware replacement for reading `emp.totals[key]` (always whole-dataset) —
 * sums a raw BigSeller column over whichever dates the page's filter selected. */
function sumMetric(emp: WorkPerformanceEmployee, dates: string[], key: keyof WorkPerformanceMetrics): number {
  return sumEmployeeMetricInRange(emp, dates, (m) => m[key])
}

/** Short "d MMM" label (no year) for dense day-by-day chart/table axes. */
function shortDateLabel(iso: string): string {
  return formatFullDateLabel(iso).split(" ").slice(0, 2).join(" ")
}

type TrendViewMode = "team" | "department" | "person"
const VIEW_MODE_OPTIONS: { key: TrendViewMode; label: string }[] = [
  { key: "team", label: "ทั้งทีม" },
  { key: "department", label: "ฝ่าย" },
  { key: "person", label: "รายคน" },
]

/**
 * "ผลงาน (BigSeller)" — per-employee daily fulfilment performance pulled
 * on-demand from BigSeller's own "รายงานผลการทำงาน" report, replacing the old
 * manual per-person entry. Deliberately a SEPARATE page/data source from every
 * other employee page — see WorkPerformance in api/types.ts for why. Ingestion
 * is manual: someone (Claude, on request) logs into BigSeller, exports the
 * report, and pastes it into the "ผลงานพนักงาน (BigSeller)" sheet tab; there is
 * no scheduled sync.
 */
export function WorkPerformance() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const { targetOverride } = useSettings()
  const [department, setDepartment] = useState("all")
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("parcels")
  const [viewMode, setViewMode] = useState<TrendViewMode>("team")
  const [selectedPerson, setSelectedPerson] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const employees = useMemo(
    () => (data?.workPerformance?.employees ?? []).filter((e) => !EXCLUDED_DEPARTMENTS.has(e.department)),
    [data]
  )
  const wp = data?.workPerformance ? { ...data.workPerformance, employees } : null

  const departments = useMemo(() => {
    if (!wp) return []
    const present = new Set(wp.employees.map((e) => e.department))
    const ordered = DEPARTMENT_ORDER.filter((d) => present.has(d))
    const extra = [...present].filter((d) => !DEPARTMENT_ORDER.includes(d)).sort()
    return [...ordered, ...extra]
  }, [wp])

  const minDate = wp?.dates[0] ?? ""
  const maxDate = wp?.dates[wp.dates.length - 1] ?? ""
  // "Today" here means the latest date the sheet actually has (a BigSeller
  // pull can lag behind the real calendar date), same convention as
  // SalesSummary/WorkforcePlanning's date filters.
  const defaultPreset = useMemo(() => {
    if (!minDate || !maxDate) return { start: minDate, end: maxDate }
    const presets = getDatePresets(maxDate, minDate)
    return presets.find((p) => p.label === "เดือนนี้") ?? { start: minDate, end: maxDate }
  }, [minDate, maxDate])
  const effectiveStart = startDate || defaultPreset.start
  const effectiveEnd = endDate || defaultPreset.end
  const filteredDates = useMemo(
    () => (wp ? wp.dates.filter((d) => d >= effectiveStart && d <= effectiveEnd) : []),
    [wp, effectiveStart, effectiveEnd]
  )

  const filtered = useMemo(() => {
    if (!wp) return []
    const rows = department === "all" ? wp.employees : wp.employees.filter((e) => e.department === department)
    return [...rows].sort((a, b) => sumMetric(b, filteredDates, "pickParcels") - sumMetric(a, filteredDates, "pickParcels"))
  }, [wp, department, filteredDates])

  // Same ranking system as the online team's "อันดับผลงานรายบุคคล" (Podium/
  // RankingList) — see workPerformanceRanking.ts's doc for the metric mapping.
  // Scoped to the selected date range, same as every other section below.
  const targetPerPerson = targetOverride ?? data?.target?.value ?? null
  const hasTarget = targetPerPerson !== null
  const effectiveRankingMetric = hasTarget ? rankingMetric : rankingMetric === "pctTarget" ? "parcels" : rankingMetric
  const ranking = useMemo(() => {
    if (!wp) return []
    const metrics = computeWpEmployeeMetrics(filtered, filteredDates, targetPerPerson ?? 0)
    return rankByMetric(metrics, effectiveRankingMetric)
  }, [wp, filtered, filteredDates, targetPerPerson, effectiveRankingMetric])
  const top3 = ranking.filter((m) => m.rank <= 3)
  const rest = ranking.filter((m) => m.rank > 3)
  const rankDeltas = useMemo(() => {
    if (!wp || filteredDates.length === 0) return new Map<string, number>()
    // No baseline yet until the sheet accumulates enough history to have real
    // dates before the selected range — computeRankDeltas already handles that
    // case cleanly (an employee absent from the previous period just gets no arrow).
    const prev = previousWindow(effectiveStart, effectiveEnd)
    const prevDates = wp.dates.filter((d) => d >= prev.start && d <= prev.end)
    const prevMetrics = computeWpEmployeeMetrics(filtered, prevDates, targetPerPerson ?? 0)
    const prevRanking = rankByMetric(prevMetrics, effectiveRankingMetric)
    return computeRankDeltas(ranking, prevRanking)
  }, [wp, filtered, filteredDates, ranking, targetPerPerson, effectiveRankingMetric, effectiveStart, effectiveEnd])
  const formatRankingMetric = rankingMetricFormatter(rankingMetric)

  // "วันนี้ vs เมื่อวาน" — always the latest two dates the sheet actually has,
  // regardless of the date-range filter above (this comparison is inherently
  // "today vs yesterday of real data", not a range).
  const dailyComparison = useMemo(() => {
    if (!wp) return []
    return [...computeWpDailyComparison(filtered, wp.dates)].sort((a, b) => b.today - a.today)
  }, [wp, filtered])
  const todayLabel = wp?.dates[wp.dates.length - 1]
  const yesterdayLabel = wp && wp.dates.length > 1 ? wp.dates[wp.dates.length - 2] : null

  const grouped = useMemo(() => {
    const map = new Map<string, WorkPerformanceEmployee[]>()
    for (const emp of filtered) {
      const list = map.get(emp.department) ?? []
      list.push(emp)
      map.set(emp.department, list)
    }
    const order = department === "all" ? departments : [department]
    return order.filter((d) => map.has(d)).map((d) => ({ department: d, employees: map.get(d)! }))
  }, [filtered, department, departments])

  // "วันต่อวัน" (day-by-day) trend — one of three scopes, chosen via viewMode.
  const trendDepartments = department === "all" ? departments : [department]
  const personOptions = useMemo(() => filtered.map((e) => ({ operator: e.operator, name: e.name })), [filtered])
  const effectivePersonOperator =
    selectedPerson && filtered.some((e) => e.operator === selectedPerson) ? selectedPerson : personOptions[0]?.operator ?? ""
  const teamTrend = useMemo(() => computeWpDailyTrend(filtered, filteredDates), [filtered, filteredDates])
  const personTrend = useMemo(() => {
    const emp = filtered.find((e) => e.operator === effectivePersonOperator)
    return emp ? computeWpDailyTrend([emp], filteredDates) : []
  }, [filtered, filteredDates, effectivePersonOperator])
  const departmentTrend = useMemo(
    () => computeWpDailyTrendByDepartment(filtered, filteredDates, trendDepartments),
    [filtered, filteredDates, trendDepartments]
  )
  const activeTrend = viewMode === "person" ? personTrend : teamTrend

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  if (!wp) {
    return (
      <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div className="text-sm">
          <p className="font-semibold text-foreground">ยังไม่พบข้อมูลผลงานพนักงานจาก BigSeller</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ต้องมีทั้งชีต "ผลงานพนักงาน (BigSeller)" และ "รายชื่อพนักงาน (BigSeller)" ก่อน — แจ้งให้ดึงข้อมูลจาก BigSeller มาใส่ชีตได้เลย
          </p>
        </div>
      </div>
    )
  }

  // Composite totals ("พัสดุ"/"สินค้า"/"Wave" — see workPerformanceRanking.ts)
  // over the selected date range, across every mapped employee.
  const totalParcels = wp.employees.reduce((s, e) => s + sumEmployeeMetricInRange(e, filteredDates, dailyParcelTotal), 0)
  const totalItems = wp.employees.reduce((s, e) => s + sumEmployeeMetricInRange(e, filteredDates, dailyItemTotal), 0)
  const totalWaves = wp.employees.reduce((s, e) => s + sumEmployeeMetricInRange(e, filteredDates, dailyWaveTotal), 0)
  const totalShip = wp.employees.reduce((s, e) => s + sumMetric(e, filteredDates, "ship"), 0)

  const handleExport = () => {
    downloadCsv(
      `bigseller-work-performance_${department}_${effectiveStart}_${effectiveEnd}.csv`,
      ["วันที่", "โอเปอเรเตอร์", "ชื่อ", "แผนก", "จัดการคำสั่งซื้อ", "พิมพ์ใบปะหน้า", "PDA หยิบของ", "จัดส่ง", "จำนวนรวมพัสดุที่หยิบ", "จำนวนรวมพัสดุที่คัดแยก", "จำนวนรวมพัสดุที่แพ็ก", "จำนวนพัสดุที่ตรวจสอบ"],
      filtered.flatMap((emp) =>
        filteredDates
          .filter((d) => emp.byDate[d])
          .map((d) => {
            const m = emp.byDate[d]!
            return [
              d,
              emp.operator,
              emp.name,
              emp.department,
              m.manageOrders,
              m.printLabel,
              m.pdaPick,
              m.ship,
              m.pickParcels,
              m.sortParcels,
              m.packParcels,
              m.inspectParcels,
            ]
          })
      )
    )
  }

  return (
    <div className="space-y-4">
      {wp.unmapped.length > 0 && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">พบบัญชี BigSeller ที่ยังไม่มีชื่อ/แผนก</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {wp.unmapped.join(", ")} — เพิ่มชื่อและแผนกในชีต "รายชื่อพนักงาน (BigSeller)" เพื่อให้แสดงผลครบ
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="พนักงานทั้งหมด" value={wp.employees.length} icon={Users} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="คน" />
        <KpiCard title="จำนวนพัสดุรวม" value={totalParcels} icon={ScanLine} gradient="bg-gradient-to-br from-sky-500 to-sky-700" suffix="ชิ้น" />
        <KpiCard title="สินค้ารวม" value={totalItems} icon={Boxes} gradient="bg-gradient-to-br from-amber-500 to-amber-600" suffix="SKU" />
        <KpiCard title="Wave รวม" value={totalWaves} icon={PackageCheck} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="Wave" />
      </div>

      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border p-1">
          <button
            type="button"
            onClick={() => setDepartment("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              department === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            ทั้งหมด
          </button>
          {departments.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepartment(d)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                department === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <DateRangePicker
          start={effectiveStart}
          end={effectiveEnd}
          minDate={minDate}
          maxDate={maxDate}
          today={maxDate}
          onChange={({ start, end }) => {
            setStartDate(start)
            setEndDate(end)
          }}
        />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Truck className="size-3.5" /> จัดส่งรวม {totalShip.toLocaleString("th-TH")}
          </span>
          <span>ช่วงที่แสดง: {formatFullDateLabel(effectiveStart)} – {formatFullDateLabel(effectiveEnd)}</span>
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Download className="size-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">อันดับผลงานรายบุคคล</h3>
          <div className="flex gap-1 rounded-xl border border-border p-1">
            {RANKING_METRIC_OPTIONS.filter((opt) => hasTarget || opt.key !== "pctTarget").map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRankingMetric(opt.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  effectiveRankingMetric === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {top3.length > 0 ? (
          <Podium top3={top3} metricFormatter={formatRankingMetric} showTarget={hasTarget} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงเวลาที่เลือก</p>
        )}

        {rest.length > 0 && (
          <div className="mt-6">
            <RankingList entries={rest} rankDeltas={rankDeltas} metricFormatter={formatRankingMetric} showTarget={hasTarget} />
          </div>
        )}
      </div>

      <ChartCard
        title="วันต่อวัน"
        subtitle={`${formatFullDateLabel(effectiveStart)} – ${formatFullDateLabel(effectiveEnd)} · จำนวนพัสดุ/สินค้า/Wave ต่อวัน`}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-xl border border-border p-1">
            {VIEW_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setViewMode(opt.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  viewMode === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {viewMode === "person" && (
            <select
              value={effectivePersonOperator}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-xs font-medium text-foreground outline-none"
            >
              {personOptions.length === 0 && <option value="">ไม่มีข้อมูล</option>}
              {personOptions.map((p) => (
                <option key={p.operator} value={p.operator} className="bg-popover text-popover-foreground">
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {viewMode === "department" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">วันที่</th>
                  {trendDepartments.map((d) => (
                    <th key={d} className="pb-2 text-right font-medium">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departmentTrend.map((r) => (
                  <tr key={r.date} className="border-b border-white/5 last:border-0">
                    <td className="py-2 text-muted-foreground">{shortDateLabel(r.date)}</td>
                    {trendDepartments.map((d) => (
                      <td key={d} className="py-2 text-right tabular-nums text-foreground">
                        {(r.byDepartment[d] ?? 0).toLocaleString("th-TH")}
                      </td>
                    ))}
                  </tr>
                ))}
                {departmentTrend.length === 0 && (
                  <tr>
                    <td colSpan={trendDepartments.length + 1} className="py-6 text-center text-muted-foreground">
                      ไม่มีข้อมูลในช่วงเวลาที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">แสดงจำนวนพัสดุรวมต่อวัน แยกตามฝ่าย</p>
          </div>
        ) : activeTrend.length > 0 ? (
          <BarLineChart
            categories={activeTrend.map((r) => shortDateLabel(r.date))}
            bars={[
              { name: "พัสดุ", data: activeTrend.map((r) => r.parcels) },
              { name: "สินค้า", data: activeTrend.map((r) => r.items) },
            ]}
            line={{ name: "Wave", data: activeTrend.map((r) => r.waves) }}
            height={300}
          />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงเวลาที่เลือก</p>
        )}
      </ChartCard>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">เทียบผลงานวันนี้ vs เมื่อวาน</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          รายละเอียดของวันนี้ ({todayLabel ?? "-"}) ตามคอลัมน์จริงจากชีต + "พัสดุรวม" (หยิบ+แพ็ก+ตรวจสอบ+จัดส่งรวมกัน) เทียบกับ{" "}
          {yesterdayLabel ?? "ไม่มีข้อมูลวันก่อนหน้า"}
        </p>
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">ชื่อ</th>
              <th className="pb-2 font-medium">แผนก</th>
              <th className="pb-2 text-right font-medium">PDA หยิบของ</th>
              <th className="pb-2 text-right font-medium">พิมพ์ใบปะหน้า</th>
              <th className="pb-2 text-right font-medium">จำนวน Wave ที่หยิบ</th>
              <th className="pb-2 text-right font-medium">จำนวนรวม SKU ที่หยิบ</th>
              <th className="pb-2 text-right font-medium">พัสดุรวม (เมื่อวาน)</th>
              <th className="pb-2 text-right font-medium">พัสดุรวม (วันนี้)</th>
              <th className="pb-2 text-right font-medium">% เปลี่ยนแปลง</th>
            </tr>
          </thead>
          <tbody>
            {dailyComparison.map((r) => (
              <tr key={r.operator} className="border-b border-white/5 last:border-0">
                <td className="py-2 font-medium text-foreground">{r.name}</td>
                <td className="py-2 text-muted-foreground">{r.department}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayPdaPick.toLocaleString("th-TH")}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayPrintLabel.toLocaleString("th-TH")}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayPickWaveCount.toLocaleString("th-TH")}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayPickSku.toLocaleString("th-TH")}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{r.yesterday.toLocaleString("th-TH")}</td>
                <td className="py-2 text-right tabular-nums text-foreground">{r.today.toLocaleString("th-TH")}</td>
                <td className="py-2 text-right">
                  {r.pctChange === null ? (
                    <span className="text-xs text-muted-foreground">ไม่มีข้อมูลเมื่อวาน</span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-sm font-semibold tabular-nums",
                        r.pctChange > 0 ? "text-emerald-glow" : r.pctChange < 0 ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {r.pctChange > 0 ? <ArrowUp className="size-3.5" /> : r.pctChange < 0 ? <ArrowDown className="size-3.5" /> : <Minus className="size-3.5" />}
                      {Math.abs(r.pctChange).toFixed(0)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {dailyComparison.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted-foreground">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grouped.map((g) => {
        // ฝ่ายคลัง's real work is moving/replenishing stock positions, not
        // pick/pack/inspect — those columns stay ~0 for this department, so
        // show the stock-move document count (see workPerformanceRanking.ts's
        // stockMoveDocs doc) instead of a wall of zeros.
        const isWarehouse = g.department === "คลัง"
        return (
          <div key={g.department} className="glass-panel overflow-x-auto rounded-2xl p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              ฝ่าย{g.department} <span className="text-xs font-normal text-muted-foreground">({g.employees.length} คน)</span>
            </h3>
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">ชื่อ</th>
                  <th className="pb-2 font-medium">Username (BigSeller)</th>
                  {isWarehouse ? (
                    <th className="pb-2 text-right font-medium">จำนวนเอกสาร (ย้าย/เติมสต็อก)</th>
                  ) : (
                    <>
                      <th className="pb-2 text-right font-medium">หยิบ (พัสดุ)</th>
                      <th className="pb-2 text-right font-medium">คัดแยก (พัสดุ)</th>
                      <th className="pb-2 text-right font-medium">แพ็ก (พัสดุ)</th>
                      <th className="pb-2 text-right font-medium">ตรวจสอบ (พัสดุ)</th>
                    </>
                  )}
                  <th className="pb-2 text-right font-medium">จัดส่ง</th>
                </tr>
              </thead>
              <tbody>
                {g.employees.map((emp) => (
                  <tr key={emp.operator} className="border-b border-white/5 last:border-0">
                    <td className="py-2 font-medium text-foreground">{emp.name}</td>
                    <td className="py-2 text-muted-foreground">{emp.operator}</td>
                    {isWarehouse ? (
                      <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, filteredDates, "stockMoveDocs").toLocaleString("th-TH")}</td>
                    ) : (
                      <>
                        <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, filteredDates, "pickParcels").toLocaleString("th-TH")}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, filteredDates, "sortParcels").toLocaleString("th-TH")}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, filteredDates, "packParcels").toLocaleString("th-TH")}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, filteredDates, "inspectParcels").toLocaleString("th-TH")}</td>
                      </>
                    )}
                    <td className="py-2 text-right tabular-nums text-foreground">{sumMetric(emp, filteredDates, "ship").toLocaleString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
