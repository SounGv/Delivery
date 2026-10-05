import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Podium } from "./Podium"
import { RankingList } from "./RankingList"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { ExportButton } from "@/components/common/ExportButton"
import { rankingReport } from "@/lib/reportExports"
import { computeRankDeltas, previousWindow, rankByMetric, type RankedEmployeeMetric, type RankingMetric } from "@/lib/workforce"
import { computeWpEmployeeMetrics } from "@/lib/workPerformanceRanking"
import { getDatePresets, TEAM_LABELS } from "@/lib/dashboard-selectors"
import { formatFullDateLabel, formatNumber } from "@/lib/format"
import { useSettings } from "@/lib/settingsContext"
import { cn } from "@/lib/utils"
import type { TeamId } from "@/api/types"

// "สินค้า", "SKU ที่หยิบ" and "พิมพ์ใบปะหน้า" tabs were dropped as duplicates: สินค้า and SKU ที่หยิบ
// are the same SKU count (the first just adds pack/inspect), and ป้าย (พิมพ์ใบปะหน้า) is near-identical
// to พัสดุ (see dailyParcelTotal). SKU and ป้าย still show in each person's small breakdown line.
const RANKING_METRIC_OPTIONS: { key: RankingMetric; label: string }[] = [
  { key: "parcels", label: "พัสดุ" },
  { key: "productivity", label: "Productivity" },
  { key: "pctTarget", label: "% Target" },
  { key: "pdaPick", label: "PDA หยิบของ" },
]

function rankingMetricFormatter(metric: RankingMetric) {
  return (m: RankedEmployeeMetric) => {
    if (metric === "parcels") return `${formatNumber(m.parcels)} พัสดุ`
    if (metric === "items") return `${formatNumber(m.items)} SKU`
    if (metric === "productivity") return `${formatNumber(Math.round(m.productivity))} พัสดุ/วัน`
    if (metric === "pdaPick") return `${formatNumber(m.pdaPick ?? 0)} PDA`
    if (metric === "pickSku") return `${formatNumber(m.pickSku ?? 0)} SKU`
    if (metric === "printLabel") return `${formatNumber(m.printLabel ?? 0)} ใบ`
    return `${(m.pctTarget ?? 0).toFixed(0)}% ของเป้า`
  }
}

/**
 * "อันดับผลงานรายบุคคล" (BigSeller-sourced), locked to ONE department — unlike
 * the old standalone "ผลงาน (BigSeller)" page's ranking (removed from there),
 * this never offers a "ทั้งหมด" view that pools ฝ่ายออนไลน์ and ฝ่ายออฟไลน์
 * into one leaderboard. Each department's tab mounts its own instance with its
 * own `team`, so the two rankings are always computed independently — per
 * explicit request, the two crews must never be merged together here.
 */
export function BigSellerRankingSection({ team }: { team: TeamId }) {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const { targetOverride } = useSettings()
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("parcels")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const deptLabel = TEAM_LABELS[team]
  const wp = data?.workPerformance ?? null
  const rankingEmployees = useMemo(
    () => (wp?.employees ?? []).filter((e) => e.department === deptLabel),
    [wp, deptLabel]
  )

  const minDate = wp?.dates[0] ?? ""
  const maxDate = wp?.dates[wp.dates.length - 1] ?? ""
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

  const targetPerPerson = targetOverride ?? data?.target?.value ?? null
  const hasTarget = targetPerPerson !== null
  const effectiveRankingMetric = hasTarget ? rankingMetric : rankingMetric === "pctTarget" ? "parcels" : rankingMetric

  const ranking = useMemo(() => {
    if (!wp) return []
    const metrics = computeWpEmployeeMetrics(rankingEmployees, filteredDates, targetPerPerson ?? 0)
    return rankByMetric(metrics, effectiveRankingMetric)
  }, [wp, rankingEmployees, filteredDates, targetPerPerson, effectiveRankingMetric])
  const top3 = ranking.filter((m) => m.rank <= 3)
  const rest = ranking.filter((m) => m.rank > 3)

  const rankDeltas = useMemo(() => {
    if (!wp || filteredDates.length === 0) return new Map<string, number>()
    const prev = previousWindow(effectiveStart, effectiveEnd)
    const prevDates = wp.dates.filter((d) => d >= prev.start && d <= prev.end)
    const prevMetrics = computeWpEmployeeMetrics(rankingEmployees, prevDates, targetPerPerson ?? 0)
    const prevRanking = rankByMetric(prevMetrics, effectiveRankingMetric)
    return computeRankDeltas(ranking, prevRanking)
  }, [wp, rankingEmployees, filteredDates, ranking, targetPerPerson, effectiveRankingMetric, effectiveStart, effectiveEnd])
  const formatRankingMetric = rankingMetricFormatter(rankingMetric)

  if (isLoading) return <LoadingSkeletonGrid count={3} />
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

  return (
    <div className="space-y-4">
      {wp.unmapped.length > 0 && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">พบบัญชี BigSeller ที่ยังไม่มีชื่อ/แผนก</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {wp.unmapped.join(", ")} — เพิ่มชื่อและแผนกในชีต "รายชื่อพนักงาน (BigSeller)" เพื่อให้แสดงผลครบ (อาจมีคนในฝ่ายนี้ตกหล่นอยู่)
            </p>
          </div>
        </div>
      )}

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground">เลือกช่วงเวลา</label>
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
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          ช่วงที่แสดง: {formatFullDateLabel(effectiveStart)} – {formatFullDateLabel(effectiveEnd)}
        </p>
        <ExportButton
          disabled={ranking.length === 0}
          label="ส่งออกอันดับ"
          build={() => rankingReport(ranking, deptLabel, effectiveStart, effectiveEnd)}
        />
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="section-title mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-extrabold tracking-wide text-foreground">
            <span className="flex size-8 items-center justify-center rounded-full bg-gold/30 text-base" aria-hidden>
              🏆
            </span>
            อันดับผลงานรายบุคคล
          </h3>
          <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
            {RANKING_METRIC_OPTIONS.filter((opt) => hasTarget || opt.key !== "pctTarget").map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRankingMetric(opt.key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition-all active:scale-95",
                  effectiveRankingMetric === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {top3.length > 0 ? (
          <Podium top3={top3} metricFormatter={formatRankingMetric} showTarget={hasTarget} hideStat={effectiveRankingMetric} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงเวลาที่เลือก</p>
        )}

        {rest.length > 0 && (
          <div className="mt-6">
            <RankingList entries={rest} rankDeltas={rankDeltas} metricFormatter={formatRankingMetric} showTarget={hasTarget} hideStat={effectiveRankingMetric} />
          </div>
        )}
      </div>
    </div>
  )
}
