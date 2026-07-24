import { lazy, Suspense, useState } from "react"
import { Award, Download, Gauge, ShieldAlert, Target } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  collectIncidents,
  computeIncidentPenalty,
  computeKpiEvaluations,
  computeTeamKpiEvaluation,
  filterEmployeeByDateRange,
  FREE_INCIDENT_ALLOWANCE,
  type KpiGrade,
} from "@/lib/dashboard-selectors"
import { formatMonthLabel, formatNumber } from "@/lib/format"
import { downloadCsv } from "@/lib/csv"
import { cn } from "@/lib/utils"

/** Full calendar-month bounds for a "yyyy-MM" key, e.g. "2026-07" -> ["2026-07-01", "2026-07-31"]. */
function monthBounds(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split("-").map(Number)
  const lastDay = new Date(year ?? 1970, month ?? 1, 0).getDate()
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(lastDay).padStart(2, "0")}` }
}

const KpiScoreChart = lazy(() =>
  import("@/components/kpi-evaluation/KpiScoreChart").then((m) => ({ default: m.KpiScoreChart }))
)

const GRADE_BADGE: Record<KpiGrade, string> = {
  A: "bg-emerald-glow/15 text-emerald-glow",
  B: "bg-brand-500/15 text-brand-400",
  C: "bg-amber-500/15 text-amber-500",
  D: "bg-destructive/15 text-destructive",
}

type EvaluationMode = "individual" | "team"

export function KpiEvaluation() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const [selectedMonth, setSelectedMonth] = useState("")
  const [penaltyPerIncident, setPenaltyPerIncident] = useState(5)
  const [mode, setMode] = useState<EvaluationMode>("individual")

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const availableMonths = [...new Set(data.dates.map((d) => d.slice(0, 7)))].sort()
  const currentMonth = data.todayDate.slice(0, 7)
  const activeMonth = selectedMonth || currentMonth
  const { start: effectiveStart, end: effectiveEnd } = monthBounds(activeMonth)

  const filteredEmployees = data.employees.map((e) => filterEmployeeByDateRange(e, effectiveStart, effectiveEnd))
  const incidents = collectIncidents(data).filter((i) => i.date >= effectiveStart && i.date <= effectiveEnd)
  const targetValue = data.target?.value ?? null

  const evaluations =
    mode === "team"
      ? [computeTeamKpiEvaluation(filteredEmployees, targetValue, incidents.length, penaltyPerIncident)]
      : computeKpiEvaluations(filteredEmployees, targetValue, incidents.length, penaltyPerIncident)
  const avgScore = evaluations.length ? evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length : 0
  const gradeACount = evaluations.filter((e) => e.grade === "A").length
  const totalPenalty = computeIncidentPenalty(incidents.length, penaltyPerIncident)

  const handleExportCsv = () => {
    downloadCsv(
      `kpi-evaluation_${mode}_${activeMonth}.csv`,
      ["อันดับ", "พนักงาน", "เฉลี่ยพัสดุ/วัน", "เฉลี่ยชิ้น/วัน", "ผลงาน (%)", "หักคะแนน (%)", "คะแนน KPI (%)", "เกรด"],
      evaluations.map((e, i) => [
        i + 1,
        e.name,
        e.avgParcelsPerDay.toFixed(0),
        e.avgItemsPerDay.toFixed(0),
        e.achievementPct.toFixed(1),
        e.penaltyPoints.toFixed(1),
        e.score.toFixed(1),
        e.grade,
      ])
    )
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground">แบบประเมิน</label>
          <div className="flex gap-1 rounded-xl border border-border p-1">
            {(["individual", "team"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "individual" ? "รายบุคคล" : "ทีม"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground" htmlFor="month-select">
            ประเมินทั้งเดือน
          </label>
          <select
            id="month-select"
            value={activeMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm font-semibold text-foreground outline-none"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m} className="bg-popover text-popover-foreground">
                {formatMonthLabel(m)}
                {m === currentMonth ? " (เดือนนี้)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground" htmlFor="penalty-input">
            หักคะแนนเมื่อผิดเกิน {FREE_INCIDENT_ALLOWANCE} ครั้ง (%)
          </label>
          <input
            id="penalty-input"
            type="number"
            min={0}
            step={1}
            value={penaltyPerIncident}
            onChange={(e) => setPenaltyPerIncident(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
          />
        </div>
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted-foreground">
          <b className="text-foreground">สูตร:</b> คะแนน KPI = ผลงานทั้งเดือน {formatMonthLabel(activeMonth)} เทียบเป้า (เฉลี่ยพัสดุ+ชิ้น/วันทำงาน ÷ เป้า {formatNumber(targetValue)}, สูงสุด 100%) − ส่วนที่หัก
          <br />
          <b className="text-foreground">เกณฑ์การหัก:</b> ข้อผิดพลาดรวมทั้งทีมเดือนนี้ {incidents.length} รายการ — ผิดไม่เกิน {FREE_INCIDENT_ALLOWANCE} ครั้ง ไม่หักคะแนน, ตั้งแต่ {FREE_INCIDENT_ALLOWANCE + 1} ครั้งขึ้นไป หัก {penaltyPerIncident}% (หักครั้งเดียว ไม่ใช่คูณตามจำนวนครั้ง) ⇒ {incidents.length > FREE_INCIDENT_ALLOWANCE ? `เกินเกณฑ์ หักคะแนน ${totalPenalty.toFixed(0)}%` : "ยังไม่ถึงเกณฑ์ ไม่หักคะแนน"}
          <br />
          <b className="text-foreground">หมายเหตุ:</b>{" "}
          {mode === "individual"
            ? "ข้อผิดพลาด/ของคืน/ของหายในชีทไม่ได้ระบุว่าเป็นของพนักงานคนไหน จึงหักเท่ากันทุกคนที่มียอดงานในเดือนนี้ ไม่ใช่การตัดสินความผิดรายบุคคล"
            : "โหมดนี้ประเมินทีมทั้งหมดเป็นหน่วยเดียว โดยคิดผลงานเฉลี่ยต่อคนต่อวัน (หารด้วยจำนวนคนที่ทำงานในวันนั้นจริง) เทียบเป้าเดียวกับรายบุคคล"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard title="เป้าหมาย" value={targetValue} icon={Target} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="ชิ้น/คน/วัน" />
        <KpiCard title="ข้อผิดพลาดทีม" value={incidents.length} icon={ShieldAlert} gradient="bg-gradient-to-br from-rose-500 to-destructive" suffix="รายการ" />
        <KpiCard
          title={mode === "individual" ? "คะแนนเฉลี่ยทีม" : "คะแนนทีม"}
          value={avgScore}
          icon={Gauge}
          gradient="bg-gradient-to-br from-emerald-glow to-brand-600"
          formatValue={(n) => n.toFixed(1)}
          suffix="%"
        />
        {mode === "individual" ? (
          <KpiCard
            title="พนักงานเกรด A"
            value={gradeACount}
            icon={Award}
            gradient="bg-gradient-to-br from-amber-500 to-amber-600"
            suffix={`/ ${evaluations.length} คน`}
          />
        ) : (
          <KpiCard
            title="เกรดทีม"
            value={0}
            icon={Award}
            gradient="bg-gradient-to-br from-amber-500 to-amber-600"
            formatValue={() => evaluations[0]?.grade ?? "-"}
          />
        )}
      </div>

      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <KpiScoreChart evaluations={evaluations} />
      </Suspense>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {mode === "individual" ? "ตารางประเมิน KPI รายบุคคล" : "ตารางประเมิน KPI ทีม"}
        </h3>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">อันดับ</th>
              <th className="pb-2 font-medium">พนักงาน</th>
              <th className="pb-2 font-medium">เฉลี่ยพัสดุ/วัน</th>
              <th className="pb-2 font-medium">เฉลี่ยชิ้น/วัน</th>
              <th className="pb-2 font-medium">ผลงาน</th>
              <th className="pb-2 font-medium">หัก</th>
              <th className="pb-2 font-medium">คะแนน KPI</th>
              <th className="pb-2 font-medium">เกรด</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((e, idx) => (
              <tr key={e.name} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-muted-foreground">#{idx + 1}</td>
                <td className="py-2 text-foreground">{e.name}</td>
                <td className="py-2 text-muted-foreground">{e.avgParcelsPerDay.toFixed(0)}</td>
                <td className="py-2 text-muted-foreground">{e.avgItemsPerDay.toFixed(0)}</td>
                <td className="py-2 text-muted-foreground">{e.achievementPct.toFixed(1)}%</td>
                <td className="py-2 text-destructive">-{e.penaltyPoints.toFixed(1)}%</td>
                <td className="py-2 font-semibold text-foreground">{e.score.toFixed(1)}%</td>
                <td className="py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", GRADE_BADGE[e.grade])}>{e.grade}</span>
                </td>
              </tr>
            ))}
            {evaluations.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  ไม่มีข้อมูลในช่วงเวลาที่เลือก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
