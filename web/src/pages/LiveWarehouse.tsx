import { motion } from "framer-motion"
import { Boxes, Clock, PackageCheck, TrendingUp, Users } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { SectionCard } from "@/components/layout/SectionCard"
import { ExportButton } from "@/components/common/ExportButton"
import { Avatar3D } from "@/components/workforce/Avatar3D"
import { getPreviousDate, getTeamTotalForDate, percentChange, rankEmployeesForDate } from "@/lib/dashboard-selectors"
import { hasNoPrimaryParcelTarget } from "@/lib/employeeRoles"
import { useEmployeeDetail } from "@/lib/employeeDetailStore"
import { formatDateLabel, formatNumber, formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm leading-none">🥇</span>
  if (rank === 2) return <span className="text-sm leading-none">🥈</span>
  if (rank === 3) return <span className="text-sm leading-none">🥉</span>
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-[9px] font-bold text-primary">
      {rank}
    </span>
  )
}

function progressTone(pct: number): { bar: string; text: string; label: string; accent: string } {
  if (pct >= 100) return { bar: "bg-emerald-glow", text: "text-emerald-glow", label: "เกินเป้าหมาย", accent: "border-l-emerald-glow" }
  if (pct >= 80) return { bar: "bg-gold", text: "text-foreground", label: "ใกล้ถึงเป้า", accent: "border-l-gold" }
  return { bar: "bg-coral", text: "text-coral-dark", label: "ต่ำกว่าเป้า", accent: "border-l-coral" }
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          size="lg"
          title="พัสดุวันนี้"
          value={today.parcels}
          icon={PackageCheck}
          gradient="bg-gradient-to-br from-brand-500 to-brand-700"
          suffix="พัสดุ"
          trend={parcelsTrend !== null ? { value: parcelsTrend } : undefined}
        />
        <KpiCard
          size="lg"
          title="สินค้าวันนี้"
          value={today.items}
          icon={Boxes}
          gradient="bg-gradient-to-br from-emerald-glow to-brand-600"
          suffix="ชิ้น"
          trend={itemsTrend !== null ? { value: itemsTrend } : undefined}
        />
        <KpiCard
          size="lg"
          title="พนักงานที่ทำงาน"
          value={today.activeEmployees}
          icon={Users}
          gradient="bg-gradient-to-br from-sky-500 to-brand-600"
          suffix={`/ ${data.employees.length} คน`}
        />
      </div>

      <div className="glass-panel grid grid-cols-1 divide-y divide-dashed divide-border rounded-2xl sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="flex items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-gold/30 text-xl" aria-hidden>
            🏆
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Top Employee</p>
            <p className="truncate text-base font-extrabold text-foreground">{topEmployee?.name ?? "-"}</p>
            {topEmployee && <p className="text-xs text-muted-foreground">{formatNumber(topEmployee.items)} ชิ้น</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand-500/15 text-primary">
            <TrendingUp className="size-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Average / คน</p>
            <p className="text-base font-extrabold tabular-nums text-foreground">
              {avgItemsPerPerson.toFixed(0)} <span className="text-xs font-medium text-muted-foreground">ชิ้น</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">อัปเดตล่าสุด</p>
            <p className="text-base font-extrabold tabular-nums text-foreground">{formatTime(data.generatedAt)}</p>
          </div>
        </div>
      </div>

      <SectionCard
        emoji="👥"
        title="ทีมวันนี้"
        subtitle={`${ranking.length} คนทำงานแล้ว · ข้อมูล ${data.todayDate} · คลิกการ์ดเพื่อดูรายละเอียด`}
        actions={
          <ExportButton
            disabled={ranking.length === 0 && idle.length === 0}
            label="ส่งออกทีมวันนี้"
            build={() => ({
              filename: `team_${data.todayDate}.csv`,
              headers: ["อันดับ", "ชื่อ", "พัสดุ", "ชิ้นงาน", "สถานะวันนี้"],
              rows: [
                ...ranking.map((r, i) => [i + 1, r.name, r.parcels ?? 0, r.items ?? 0, "ทำงาน"] as (string | number)[]),
                ...idle.map((e) => ["", e.name, "", "", "ไม่ได้ทำงาน"] as (string | number)[]),
              ],
            })}
          />
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ranking.map((r, idx) => {
            const rank = idx + 1
            const rawPct = target && !hasNoPrimaryParcelTarget(r.name) ? (((r.parcels ?? 0) + (r.items ?? 0)) / target) * 100 : null
            const tone = rawPct !== null ? progressTone(rawPct) : null
            const emotion = rawPct === null ? "calm" : rawPct >= 100 ? "great" : rawPct >= 80 ? "good" : "calm"

            return (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-2xl border border-l-[6px] border-border bg-card p-3 shadow-[0_4px_20px_rgba(43,168,162,0.10)] transition-transform hover:-translate-y-0.5",
                  tone ? tone.accent : "border-l-brand-400"
                )}
                onClick={() => openEmployeeDetail(r.name)}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar3D name={r.name} emotion={emotion} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <RankBadge rank={rank} />
                      <p className="truncate text-sm font-extrabold tracking-wide text-foreground">{r.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(r.parcels)} พัสดุ · {formatNumber(r.items)} ชิ้น
                    </p>
                  </div>
                </div>
                {tone && rawPct !== null && (
                  <div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full transition-all", tone.bar)} style={{ width: `${Math.min(100, rawPct)}%` }} />
                    </div>
                    <p className={cn("mt-1 text-[11px] font-bold", tone.text)}>
                      {rawPct.toFixed(0)}% · {tone.label}
                    </p>
                  </div>
                )}
              </motion.div>
            )
          })}
          {ranking.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">ยังไม่มีใครบันทึกงานวันนี้</p>}
        </div>
      </SectionCard>

      {idle.length > 0 && (
        <SectionCard emoji="😴" title="ยังไม่ได้ทำงานวันนี้" subtitle={`${idle.length} คน · ${formatDateLabel(data.todayDate)}`}>
          <div className="flex flex-wrap gap-2">
            {idle.map((e) => (
              <button
                key={e.name}
                type="button"
                onClick={() => openEmployeeDetail(e.name)}
                className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                <Avatar3D name={e.name} emotion="calm" size={22} />
                {e.name}
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
