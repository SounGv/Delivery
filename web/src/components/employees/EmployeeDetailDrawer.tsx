import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, HelpCircle, X } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { useEmployeeDetail } from "@/lib/employeeDetailStore"
import { buildFollowUpRows, addDays, TEAM_LABELS, teamOf } from "@/lib/dashboard-selectors"
import { getEmployeeRole } from "@/lib/employeeRoles"
import { useSettings } from "@/lib/settingsContext"
import { StatusBadge } from "@/components/kpi/StatusBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateLabel, formatFullDateLabel } from "@/lib/format"
import { initialsOf } from "@/lib/avatar"
import { colorForName } from "@/lib/avatarColor"
import { cn } from "@/lib/utils"

const BarLineChart = lazy(() =>
  import("@/components/charts/BarLineChart").then((m) => ({ default: m.BarLineChart }))
)

type RangeKey = "7d" | "30d" | "month" | "lastMonth"
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 วัน" },
  { key: "30d", label: "30 วัน" },
  { key: "month", label: "เดือนนี้" },
  { key: "lastMonth", label: "เดือนที่แล้ว" },
]

function rangeFor(key: RangeKey, todayDate: string): { start: string; end: string } {
  if (key === "7d") return { start: addDays(todayDate, -6), end: todayDate }
  if (key === "30d") return { start: addDays(todayDate, -29), end: todayDate }
  const monthKey = todayDate.slice(0, 7)
  if (key === "month") return { start: `${monthKey}-01`, end: todayDate }
  const [y, m] = monthKey.split("-").map(Number)
  const d = new Date(y!, m! - 2, 1)
  const lastMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return { start: `${lastMonthKey}-01`, end: `${lastMonthKey}-${String(lastDay).padStart(2, "0")}` }
}

/** A checklist row: computed when data can answer it, an honest "no data source
 * yet" note when it can't — never a fabricated answer. */
function ChecklistRow({ label, state }: { label: string; state: "yes" | "no" | "unknown" }) {
  const Icon = state === "unknown" ? HelpCircle : state === "yes" ? CheckCircle2 : AlertCircle
  const tone = state === "unknown" ? "text-muted-foreground" : state === "yes" ? "text-emerald-glow" : "text-amber-500"
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />
      <span className="text-foreground">{label}</span>
    </li>
  )
}

export function EmployeeDetailDrawer() {
  const { openName, close } = useEmployeeDetail()
  const { data } = useTeamDashboard()
  const { targetOverride } = useSettings()
  const [range, setRange] = useState<RangeKey>("7d")

  useEffect(() => {
    if (!openName) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openName, close])

  const targetPerPerson = targetOverride ?? data?.target?.value ?? null
  const followUpRows = useMemo(() => (data ? buildFollowUpRows(data, targetPerPerson) : []), [data, targetPerPerson])

  if (!openName || !data) return null

  const row = followUpRows.find((r) => r.name === openName)
  // Some names exist in more than one department (e.g. an online and an offline
  // employee happen to share the same short nickname) — `allEmployees` is the
  // full unscoped roster, so a name-only match can silently resolve to the
  // WRONG person's history. `row.team` comes from the already team-scoped
  // follow-up rows, so disambiguate by it whenever it's available.
  const employee = data.allEmployees.find((e) => e.name === openName && (!row?.team || e.team === row.team))

  const { start, end } = rangeFor(range, data.todayDate)
  const rangeDates = data.dates.filter((d) => d >= start && d <= end).sort()
  const dailyParcels = rangeDates.map((d) => employee?.byDate[d]?.parcels ?? 0)
  const targetLine = rangeDates.map(() => targetPerPerson)

  const todayEntry = employee?.byDate[data.todayDate]
  const hasTodayRecord = !!todayEntry && (todayEntry.parcels !== null || todayEntry.items !== null)
  const todayNote = todayEntry?.note?.trim()
  const role = getEmployeeRole(openName)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={close}>
      <div
        className="glass-panel h-full w-full max-w-lg overflow-y-auto rounded-none border-l p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: employee ? colorForName(employee.name).base : "#94a3b8" }}
            >
              {employee ? initialsOf(employee.name) : "?"}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{openName}</h2>
              <p className="text-xs text-muted-foreground">{employee ? TEAM_LABELS[teamOf(employee)] : "-"}</p>
            </div>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {!employee || !row ? (
          <p className="mt-6 text-sm text-muted-foreground">ไม่พบข้อมูลพนักงานคนนี้ในช่วงข้อมูลปัจจุบัน</p>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2">
              <StatusBadge status={row.status} />
              {row.consecutiveDaysBelow > 1 && (
                <span className="text-xs font-medium text-destructive">ต่ำกว่าเป้าต่อเนื่อง {row.consecutiveDaysBelow} วัน</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-muted-foreground">วันนี้</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{row.todayOutput ?? "-"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">เมื่อวาน</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{row.yesterday ?? "-"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">เดือนนี้</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{row.monthTotal.toLocaleString("th-TH")}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">เดือนที่แล้ว</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{row.lastMonthTotal.toLocaleString("th-TH")}</p>
              </div>
            </div>

            <div className="mt-5 flex gap-1 rounded-xl border border-border p-1">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                    range === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
                <BarLineChart
                  categories={rangeDates.map((d) => formatDateLabel(d))}
                  bars={[{ name: "พัสดุ", data: dailyParcels }]}
                  line={{ name: "เป้า", data: targetLine }}
                  height={220}
                />
              </Suspense>
            </div>

            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-foreground">สิ่งที่ควรตรวจสอบก่อนพูดคุย</h3>
              <ul className="space-y-2 rounded-xl border border-border p-3">
                <ChecklistRow
                  label={hasTodayRecord ? `เข้าเวรวันนี้ (${formatFullDateLabel(data.todayDate)})` : `ไม่มีข้อมูลเข้าเวรวันนี้ — อาจไม่ได้เข้าเวร/ลา`}
                  state={hasTodayRecord ? "yes" : "no"}
                />
                <ChecklistRow
                  label={
                    row.consecutiveDaysBelow > 0
                      ? `ผลงานต่ำกว่าเป้าต่อเนื่อง ${row.consecutiveDaysBelow} วัน`
                      : "ผลงานไม่ได้ต่ำกว่าเป้าต่อเนื่อง"
                  }
                  state={row.consecutiveDaysBelow > 1 ? "no" : "yes"}
                />
                <ChecklistRow
                  label={role ? `หน้าที่หลักตามปกติ: ${role}` : "ได้รับมอบหมายงานหรือไม่ / งานยากกว่าปกติหรือไม่"}
                  state={role ? "yes" : "unknown"}
                />
                <ChecklistRow
                  label={todayNote ? `หมายเหตุล่าสุด: ${todayNote}` : "ไม่มีหมายเหตุจากการติดตามครั้งก่อนในชีท"}
                  state={todayNote ? "yes" : "unknown"}
                />
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                รายการที่ขึ้น "ไม่มีข้อมูล" ยังไม่มีคอลัมน์รองรับในชีทที่เชื่อมอยู่ — ไม่ได้แปลว่าไม่มีเหตุผล เพียงยังตรวจสอบจากระบบนี้ไม่ได้
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
