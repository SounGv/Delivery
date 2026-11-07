import { useMemo, useState } from "react"
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, FileWarning, PackageOpen, UserCheck, Users, Warehouse } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { StatTile, StatusPill, type Tone } from "@/components/returns/ReturnsUi"
import { daysBetween } from "@/lib/cancelled-selectors"
import { datesWithData, hasValue, isAttendanceCategory, latestDateOf, latestMetricDate } from "@/lib/rw-summary"
import { formatDateLabel } from "@/lib/format"
import type { RwDepartment, RwMetric, RwStaff, RwStaffCategory } from "@/api/types"

const num = (n: number | null) => (n == null ? "-" : n.toLocaleString("th-TH"))

/** How fresh a block of the sheet is, in the page's status colours: updated within 3 days is fine,
 * within 14 days is getting stale, older than that nobody is filling it in. */
function freshness(latest: string, todayIso: string): { tone: Tone; label: string } {
  if (!latest) return { tone: "neutral", label: "ยังไม่มีข้อมูลในชีต" }
  const age = daysBetween(latest, todayIso)
  if (age <= 3) return { tone: "ok", label: `อัปเดตล่าสุด ${formatDateLabel(latest)}` }
  if (age <= 14) return { tone: "warn", label: `ไม่ได้อัปเดต ${age} วัน (ล่าสุด ${formatDateLabel(latest)})` }
  return { tone: "danger", label: `ไม่ได้อัปเดต ${age} วัน (ล่าสุด ${formatDateLabel(latest)})` }
}

/** Shared view for both the combined legacy page and the two split per-department pages
 * (ReceivingDepartmentPage / WarehouseDepartmentPage) — `onlyTitle` restricts the departments to
 * "ฝ่ายรับเข้า" or "ฝ่ายคลัง". The sheet block behind it is filled in by hand, so the page
 * leads with what is actually filled in and says plainly which blocks have gone stale instead
 * of showing tables of dashes. */
function ReceivingWarehouseView({ onlyTitle }: { onlyTitle?: string }) {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const rwAll = data?.receivingWarehouse ?? null
  const rw = useMemo(() => {
    if (!rwAll) return null
    if (!onlyTitle) return rwAll
    return { ...rwAll, departments: rwAll.departments.filter((d) => d.title === onlyTitle) }
  }, [rwAll, onlyTitle])

  const activeDates = useMemo(() => (rw ? datesWithData(rw.departments) : []), [rw])
  const [date, setDate] = useState<string>("")
  const activeDate = date || activeDates[0] || ""

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  if (!rw || rw.departments.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
        ยังไม่มีข้อมูล{onlyTitle ?? "ฝ่ายรับเข้า/ฝ่ายคลัง"} — ตรวจว่าได้ redeploy Apps Script (เวอร์ชันที่อ่านแท็บ "ตารางงาน … รับเข้า+คลัง") แล้วหรือยัง
      </div>
    )
  }

  const todayIso = data.todayDate
  const index = activeDates.indexOf(activeDate)
  const olderDate = index >= 0 ? activeDates[index + 1] : undefined
  const newerDate = index > 0 ? activeDates[index - 1] : undefined

  return (
    <div className="space-y-6">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <CalendarDays className="ml-1 size-5 text-primary" />
        <span className="text-sm font-bold text-foreground">ดูข้อมูลวันที่</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="วันก่อนหน้าที่มีข้อมูล"
            disabled={!olderDate}
            onClick={() => olderDate && setDate(olderDate)}
            className="rounded-full border border-border p-2 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <select
            value={activeDate}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-full border border-border bg-background px-4 py-2 text-sm font-bold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
          >
            {activeDates.map((d) => (
              <option key={d} value={d}>
                {formatDateLabel(d)}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="วันถัดไปที่มีข้อมูล"
            disabled={!newerDate}
            onClick={() => newerDate && setDate(newerDate)}
            className="rounded-full border border-border p-2 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">เลือกได้เฉพาะวันที่มีข้อมูลในชีต · ข้อมูลจากแท็บ "รับเข้า+คลัง" (ทีมกรอกเอง)</p>
      </div>

      {rw.departments.map((dep) => (
        <DepartmentSection key={dep.title} dep={dep} date={activeDate} todayIso={todayIso} onJump={setDate} />
      ))}
    </div>
  )
}

function DepartmentSection({ dep, date, todayIso, onJump }: { dep: RwDepartment; date: string; todayIso: string; onJump: (date: string) => void }) {
  const Icon = dep.title.indexOf("คลัง") !== -1 ? Warehouse : PackageOpen
  const kpiCategories = dep.staffCategories.filter((c) => !isAttendanceCategory(c))
  const attendance = dep.staffCategories.find(isAttendanceCategory)

  const freshCategories = kpiCategories.filter((c) => {
    const l = latestDateOf(c)
    return l && daysBetween(l, todayIso) <= 14
  }).length
  const freshMetrics = dep.metrics.filter((m) => {
    const l = latestMetricDate(m)
    return l && daysBetween(l, todayIso) <= 14
  }).length
  const checkedIn = attendance ? attendance.employees.filter((e) => !!e.byDate[date]?.checkIn).length : 0
  const staffCount = attendance?.employees.length ?? 0

  const toneOf = (fresh: number, total: number): Tone => (total === 0 ? "neutral" : fresh === total ? "ok" : fresh === 0 ? "danger" : "warn")

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 px-1 text-lg font-extrabold text-foreground">
        <Icon className="size-6 text-primary" /> {dep.title}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          tone={toneOf(freshCategories, kpiCategories.length)}
          icon={ClipboardList}
          label="KPI รายคนที่ยังมีคนกรอก"
          value={
            <>
              {num(freshCategories)}
              <span className="text-lg font-bold text-muted-foreground"> / {num(kpiCategories.length)} หมวด</span>
            </>
          }
          sub="นับหมวดที่มีข้อมูลใหม่ภายใน 14 วัน"
        />
        <StatTile
          tone={staffCount === 0 ? "neutral" : checkedIn > 0 ? "ok" : "warn"}
          icon={UserCheck}
          label={`เข้างานวันที่ ${formatDateLabel(date)}`}
          value={
            <>
              {num(checkedIn)}
              <span className="text-lg font-bold text-muted-foreground"> / {num(staffCount)} คน</span>
            </>
          }
          sub="นับคนที่มีเวลาเข้างานบันทึกไว้"
        />
        <StatTile
          tone={toneOf(freshMetrics, dep.metrics.length)}
          icon={FileWarning}
          label="บันทึก KPI รวมฝ่าย"
          value={
            <>
              {num(freshMetrics)}
              <span className="text-lg font-bold text-muted-foreground"> / {num(dep.metrics.length)} รายการ</span>
            </>
          }
          sub="นับรายการที่มีบันทึกใหม่ภายใน 14 วัน"
        />
      </div>

      {attendance && <AttendanceCard cat={attendance} date={date} />}

      {kpiCategories.map((cat) => (
        <CategoryCard key={`${cat.id}-${cat.title}`} cat={cat} date={date} todayIso={todayIso} onJump={onJump} />
      ))}

      {dep.metrics.length > 0 && (
        <div className="space-y-3">
          <h3 className="px-1 text-base font-bold text-foreground">บันทึก KPI รวมฝ่าย</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {dep.metrics.map((m) => (
              <MetricCard key={m.id || m.title} metric={m} todayIso={todayIso} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function AttendanceCard({ cat, date }: { cat: RwStaffCategory; date: string }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-foreground">
        <Users className="size-5 text-primary" /> เข้า-ออกงาน
        <span className="text-xs font-normal text-muted-foreground">({cat.target})</span>
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cat.employees.map((e) => {
          const v = e.byDate[date]
          const present = !!v?.checkIn
          return (
            <div key={e.name} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
              <span className="text-sm font-semibold text-foreground">{e.name}</span>
              {present ? (
                <StatusPill tone="ok" icon={CheckCircle2} small>
                  {v?.checkIn}
                  {v?.checkOut ? ` – ${v.checkOut}` : " เข้างานแล้ว"}
                </StatusPill>
              ) : (
                <StatusPill tone="neutral" icon={Clock} small>
                  ไม่มีบันทึก
                </StatusPill>
              )}
            </div>
          )
        })}
        {cat.employees.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีรายชื่อ</p>}
      </div>
    </div>
  )
}

function CategoryCard({ cat, date, todayIso, onJump }: { cat: RwStaffCategory; date: string; todayIso: string; onJump: (date: string) => void }) {
  const latest = latestDateOf(cat)
  const fresh = freshness(latest, todayIso)
  const people: { e: RwStaff; v: NonNullable<RwStaff["byDate"][string]> }[] = []
  for (const e of cat.employees) {
    const v = e.byDate[date]
    if (v && hasValue(v)) people.push({ e, v })
  }

  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-foreground">
            {cat.id && `${cat.id}. `}
            {cat.title || "(ไม่มีชื่อหมวดในชีต)"}
          </h3>
          {cat.target && cat.target !== "-" && <p className="text-xs text-muted-foreground">เป้า: {cat.target}</p>}
        </div>
        <StatusPill tone={fresh.tone} icon={fresh.tone === "ok" ? CheckCircle2 : Clock}>
          {fresh.label}
        </StatusPill>
      </div>

      {people.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {people.map(({ e, v }) => (
            <div key={e.name} className="rounded-xl border border-border p-3">
              <p className="text-sm font-bold text-foreground">{e.name}</p>
              <div className="mt-1 flex items-end gap-4">
                <p className="text-2xl font-extrabold tabular-nums text-foreground">
                  {num(v.value1)} <span className="text-[11px] font-semibold text-muted-foreground">SKU/บิล</span>
                </p>
                <p className="text-2xl font-extrabold tabular-nums text-foreground">
                  {num(v.value2)} <span className="text-[11px] font-semibold text-muted-foreground">ชิ้น</span>
                </p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                รวมเดือน {num(e.totalValue1)} · {num(e.totalValue2)}
                {(v.checkIn || v.checkOut) && ` · ${v.checkIn ?? "-"} – ${v.checkOut ?? "-"}`}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <span>ไม่มีข้อมูลของวันที่ {formatDateLabel(date)}</span>
          {latest && latest !== date && (
            <button
              type="button"
              onClick={() => onJump(latest)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-muted"
            >
              ไปดูวันที่ล่าสุด {formatDateLabel(latest)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function MetricCard({ metric: m, todayIso }: { metric: RwMetric; todayIso: string }) {
  const latest = latestMetricDate(m)
  const fresh = freshness(latest, todayIso)
  const text = latest ? m.byDate[latest] : ""
  const days = Object.values(m.byDate).filter((t) => t?.trim()).length

  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-foreground">
            {m.id && `${m.id}. `}
            {m.title}
          </h4>
          {m.target && m.target !== "-" && <p className="text-xs text-muted-foreground">เป้า: {m.target}</p>}
        </div>
        <StatusPill tone={fresh.tone} icon={fresh.tone === "ok" ? CheckCircle2 : Clock} small>
          {fresh.label}
        </StatusPill>
      </div>
      {text ? (
        <p className="mt-2 whitespace-pre-line rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">{text}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">ยังไม่มีบันทึก</p>
      )}
      {days > 0 && <p className="mt-1 text-[11px] text-muted-foreground">มีบันทึกทั้งหมด {num(days)} วัน</p>}
    </div>
  )
}

/** Combined view — kept only as the target of the legacy "receiving-warehouse"
 * route alias (old bookmarks/deep-links), no longer linked from the sidebar. */
export function ReceivingWarehouse() {
  return <ReceivingWarehouseView />
}

export function ReceivingDepartmentPage() {
  return <ReceivingWarehouseView onlyTitle="ฝ่ายรับเข้า" />
}

export function WarehouseDepartmentPage() {
  return <ReceivingWarehouseView onlyTitle="ฝ่ายคลัง" />
}
