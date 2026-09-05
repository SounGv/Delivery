import { motion } from "framer-motion"
import { Boxes, Clock, PackageCheck, TrendingUp, Trophy, Users } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { getPreviousDate, getTeamTotalForDate, percentChange, rankEmployeesForDate } from "@/lib/dashboard-selectors"
import { hasNoPrimaryParcelTarget } from "@/lib/employeeRoles"
import { useEmployeeDetail } from "@/lib/employeeDetailStore"
import { formatDateLabel, formatNumber, formatTime } from "@/lib/format"
import { initialsOf } from "@/lib/avatar"
import { cn } from "@/lib/utils"

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm leading-none">🥇</span>
  if (rank === 2) return <span className="text-sm leading-none">🥈</span>
  if (rank === 3) return <span className="text-sm leading-none">🥉</span>
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-[9px] font-bold text-brand-400">
      {rank}
    </span>
  )
}

function progressTone(pct: number): { bar: string; text: string; label: string } {
  if (pct >= 100) return { bar: "bg-emerald-glow", text: "text-emerald-glow", label: "เกินเป้าหมาย" }
  if (pct >= 80) return { bar: "bg-amber-500", text: "text-amber-500", label: "ใกล้ถึงเป้า" }
  return { bar: "bg-destructive", text: "text-destructive", label: "ต่ำกว่าเป้า" }
}

export function LiveWarehouse() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const { openEmployeeDetail } = useEmployeeDetail()

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const today = getTeamTotalForDate(data, data.todayDate)
  const yesterday = getTeamTotalForDate(data, getPreviousDate(data.todayDate))
  const parcelsTrend = percentChange(today.parcels, yesterday.parcels)
  const itemsTrend = percentChange(today.items, yesterday.items)

  const isActiveToday = (parcels: number | null, items: number | null) => (parcels ?? 0) > 0 || (items ?? 0) > 0
  const ranking = rankEmployeesForDate(data.employees, data.todayDate).filter((r) => isActiveToday(r.parcels, r.items))
  const idle = data.employees.filter((e) => {
    const entry = e.byDate[data.todayDate]
    return !isActiveToday(entry?.parcels ?? null, entry?.items ?? null)
  })

  const topEmployee = ranking[0]
  const avgItemsPerPerson = today.activeEmployees > 0 ? today.items / today.activeEmployees : 0
  const target = data.target?.value ?? null

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-muted-foreground">ข้อมูลล่าสุดจากชีท ({data.todayDate})</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          title="พัสดุวันนี้"
          value={today.parcels}
          icon={PackageCheck}
          gradient="bg-gradient-to-br from-brand-500 to-brand-700"
          suffix="พัสดุ"
          trend={parcelsTrend !== null ? { value: parcelsTrend } : undefined}
        />
        <KpiCard
          title="สินค้าวันนี้"
          value={today.items}
          icon={Boxes}
          gradient="bg-gradient-to-br from-emerald-glow to-brand-600"
          suffix="ชิ้น"
          trend={itemsTrend !== null ? { value: itemsTrend } : undefined}
        />
        <KpiCard
          title="พนักงานที่ทำงาน"
          value={today.activeEmployees}
          icon={Users}
          gradient="bg-gradient-to-br from-violet-500 to-brand-600"
          suffix={`/ ${data.employees.length} คน`}
        />
        <KpiCard
          title="Top Employee"
          value={null}
          valueText={topEmployee?.name ?? "-"}
          subtitle={topEmployee ? `${formatNumber(topEmployee.items)} ชิ้น` : undefined}
          icon={Trophy}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
        />
        <KpiCard
          title="Average / คน"
          value={avgItemsPerPerson}
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-brand-400 to-brand-600"
          formatValue={(n) => n.toFixed(0)}
          suffix="ชิ้น"
        />
        <KpiCard
          title="Last Update"
          value={null}
          valueText={formatTime(data.generatedAt)}
          icon={Clock}
          gradient="bg-gradient-to-br from-slate-500 to-slate-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ranking.map((r, idx) => {
          const rank = idx + 1
          const rawPct = target && !hasNoPrimaryParcelTarget(r.name) ? (((r.parcels ?? 0) + (r.items ?? 0)) / target) * 100 : null
          const tone = rawPct !== null ? progressTone(rawPct) : null

          return (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.03 }}
              className="glass-panel flex cursor-pointer flex-col gap-2 rounded-xl p-3 transition-colors hover:bg-muted/40"
              onClick={() => openEmployeeDetail(r.name)}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-emerald-glow text-xs font-semibold text-white">
                  {initialsOf(r.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <RankBadge rank={rank} />
                    <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                    <span className="flex size-1.5 shrink-0 rounded-full bg-emerald-glow" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(r.parcels)} พัสดุ · {formatNumber(r.items)} ชิ้น
                  </p>
                </div>
              </div>
              {tone && rawPct !== null && (
                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn("h-full rounded-full transition-all", tone.bar)}
                      style={{ width: `${Math.min(100, rawPct)}%` }}
                    />
                  </div>
                  <p className={cn("mt-1 text-[10px] font-medium", tone.text)}>
                    {rawPct.toFixed(0)}% · {tone.label}
                  </p>
                </div>
              )}
            </motion.div>
          )
        })}

        {idle.map((e) => (
          <div
            key={e.name}
            className="glass-panel flex cursor-pointer items-center gap-2.5 rounded-xl p-3 opacity-50 transition-colors hover:bg-muted/40 hover:opacity-80"
            onClick={() => openEmployeeDetail(e.name)}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-muted-foreground">
              {initialsOf(e.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-foreground">{e.name}</p>
                <span className="flex size-1.5 shrink-0 rounded-full bg-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">ไม่ได้ทำงานวันนี้ · {formatDateLabel(data.todayDate)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
