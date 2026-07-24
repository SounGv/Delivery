import { lazy, Suspense } from "react"
import { AlertTriangle, CalendarClock, ListChecks, TrendingDown } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Skeleton } from "@/components/ui/skeleton"
import { collectIncidents, countIncidentsByCategory, datesInMonth, monthKeyOf } from "@/lib/dashboard-selectors"
import { formatDateLabel } from "@/lib/format"

const ErrorsByCategoryChart = lazy(() =>
  import("@/components/errors/ErrorsByCategoryChart").then((m) => ({ default: m.ErrorsByCategoryChart }))
)

export function Errors() {
  const { data, isLoading, isError, error } = useDashboardQuery()

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const incidents = collectIncidents(data)
  const monthDates = datesInMonth(data.dates, monthKeyOf(data.todayDate))
  const monthSet = new Set(monthDates)
  const incidentsThisMonth = incidents.filter((i) => monthSet.has(i.date)).length
  const categoryCounts = countIncidentsByCategory(incidents)
  const latestIncidentDate = incidents[0]?.date

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard title="รายการผิดปกติ (เดือนนี้)" value={incidentsThisMonth} icon={AlertTriangle} gradient="bg-gradient-to-br from-rose-500 to-destructive" suffix="รายการ" />
        <KpiCard title="รายการผิดปกติสะสม" value={incidents.length} icon={ListChecks} gradient="bg-gradient-to-br from-amber-500 to-rose-500" suffix="รายการ" />
        <KpiCard title="หมวดที่ได้รับผลกระทบ" value={categoryCounts.length} icon={TrendingDown} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="หมวด" />
        <KpiCard
          title="ล่าสุดเมื่อ"
          value={latestIncidentDate ? 1 : 0}
          icon={CalendarClock}
          gradient="bg-gradient-to-br from-violet-500 to-brand-600"
          formatValue={() => (latestIncidentDate ? formatDateLabel(latestIncidentDate) : "-")}
        />
      </div>

      {categoryCounts.length > 0 && (
        <Suspense fallback={<Skeleton className="h-60 rounded-2xl" />}>
          <ErrorsByCategoryChart counts={categoryCounts} />
        </Suspense>
      )}

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Error Timeline</h3>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">วันที่</th>
              <th className="pb-2 font-medium">หมวด</th>
              <th className="pb-2 font-medium">รายการ</th>
              <th className="pb-2 font-medium">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc, idx) => (
              <tr key={`${inc.date}-${inc.categoryId}-${idx}`} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-foreground">{formatDateLabel(inc.date)}</td>
                <td className="py-2 text-muted-foreground">{inc.categoryId}. {inc.categoryTitle}</td>
                <td className="py-2 text-muted-foreground">{inc.label}</td>
                <td className="py-2 text-destructive">{inc.text}</td>
              </tr>
            ))}
            {incidents.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  ไม่มีรายการผิดปกติในชีท 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
