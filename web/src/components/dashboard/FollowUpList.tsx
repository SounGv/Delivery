import { useMemo, useState } from "react"
import { ChevronRight, Flame, Search, Users } from "lucide-react"
import type { EmployeeTableRow } from "@/components/employees/EmployeeTable"
import { StatusBadge } from "@/components/kpi/StatusBadge"
import { TEAM_LABELS } from "@/lib/dashboard-selectors"
import { CharacterAvatar } from "@/components/dashboard/CharacterAvatar"
import { formatNumber } from "@/lib/format"
import { STATUS_COLOR, STATUS_LABEL_TH, type KpiStatus } from "@/lib/status"
import { cn } from "@/lib/utils"

const numOrDash = (n: number | null | undefined) => (n === null || n === undefined ? "–" : formatNumber(n))

/** Fill of the progress bar for each status; the word and the percentage carry the meaning too, not colour alone. */
const BAR: Record<KpiStatus, string> = {
  "below-target": "from-rose-400 to-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.45)]",
  watch: "from-amber-300 to-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.45)]",
  "on-target": "from-emerald-400 to-emerald-600 shadow-[0_0_10px_rgba(39,174,96,0.45)]",
  "no-data": "from-slate-300 to-slate-400",
  "no-target": "from-sky-300 to-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.4)]",
}

/** The statuses shown in the summary strip, in the order of risk. */
const SUMMARY: KpiStatus[] = ["below-target", "watch", "no-data", "on-target"]

function Avatar({ name, status }: { name: string; status: KpiStatus }) {
  return (
    <span className="flex shrink-0 rounded-full shadow-[0_10px_18px_-8px_rgba(0,0,0,0.55)] ring-2 ring-card">
      <CharacterAvatar name={name} status={status} size={56} />
    </span>
  )
}

function FollowUpCard({ row, rank, onOpen }: { row: EmployeeTableRow; rank: number; onOpen?: (name: string) => void }) {
  const pct = row.pctTarget === null ? null : Math.max(0, Math.min(100, row.pctTarget))
  const colour = STATUS_COLOR[row.status]
  return (
    <button
      type="button"
      onClick={() => onOpen?.(row.name)}
      className="group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-accent/40 p-4 pl-5 text-left shadow-[0_14px_30px_-20px_rgba(43,168,162,0.75)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-18px_rgba(43,168,162,0.9)]"
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", colour.dot)} aria-hidden />

      <span className="flex items-center gap-3">
        <span className="relative">
          <Avatar name={row.name} status={row.status} />
          <span
            className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-[#17706b] to-[#1a7f79] text-[11px] font-extrabold text-white shadow-md ring-2 ring-card"
            aria-label={`อันดับความเสี่ยง ${rank}`}
          >
            {rank}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-extrabold text-foreground">{row.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {row.team && <span className="text-xs text-muted-foreground">{TEAM_LABELS[row.team]}</span>}
            <StatusBadge status={row.status} size="sm" />
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </span>

      <span className="block">
        <span className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            วันนี้ <b className="text-sm tabular-nums text-foreground">{numOrDash(row.todayOutput)}</b>
            {row.target !== null && <> / เป้า {numOrDash(row.target)}</>}
          </span>
          <span className="text-base font-extrabold tabular-nums text-foreground">{row.pctTarget === null ? "–" : `${row.pctTarget.toFixed(0)}%`}</span>
        </span>
        <span
          className="block h-2.5 overflow-hidden rounded-full bg-muted shadow-inner"
          role="img"
          aria-label={pct === null ? `${STATUS_LABEL_TH[row.status]}` : `ถึงเป้า ${pct.toFixed(0)} เปอร์เซ็นต์`}
        >
          <span className={cn("block h-full rounded-full bg-gradient-to-r", BAR[row.status])} style={{ width: `${pct ?? 0}%` }} />
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
          เมื่อวาน <b className="tabular-nums text-foreground">{numOrDash(row.yesterday)}</b>
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
          เดือนนี้ <b className="tabular-nums text-foreground">{numOrDash(row.monthTotal)}</b>
        </span>
        {row.consecutiveDaysBelow ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-700 dark:text-rose-300">
            <Flame className="size-3" />
            ต่ำกว่าเป้าต่อเนื่อง {row.consecutiveDaysBelow} วัน
          </span>
        ) : null}
      </span>

      {row.reason && <span className="line-clamp-2 text-xs text-muted-foreground">{row.reason}</span>}
    </button>
  )
}

/** "พนักงานที่ต้องติดตาม": the people most at risk first, as cards instead of a wide table. `allRows` is the
 * full risk-sorted list (for the summary strip and the "see everyone" button); only the first `limit` are drawn. */
export function FollowUpList({
  allRows,
  limit,
  teamLabel,
  onOpen,
  onViewAll,
}: {
  allRows: EmployeeTableRow[]
  limit: number
  teamLabel: string
  onOpen?: (name: string) => void
  onViewAll: () => void
}) {
  const [query, setQuery] = useState("")
  const shown = useMemo(() => allRows.slice(0, limit), [allRows, limit])
  const q = query.trim().toLowerCase()
  const filtered = q ? shown.filter((r) => r.name.toLowerCase().includes(q)) : shown
  const counts = useMemo(() => {
    const c: Record<KpiStatus, number> = { "below-target": 0, watch: 0, "no-data": 0, "on-target": 0, "no-target": 0 }
    for (const r of allRows) c[r.status] += 1
    return c
  }, [allRows])

  if (allRows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีพนักงานในทีมที่เลือก</p>

  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-2" aria-label="สรุปจำนวนพนักงานตามสถานะ">
        {SUMMARY.map((s) => (
          <li
            key={s}
            className={cn(
              "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold shadow-sm ring-1 ring-inset ring-current/15",
              STATUS_COLOR[s].bg,
              STATUS_COLOR[s].text
            )}
          >
            <span className={cn("size-2 rounded-full", STATUS_COLOR[s].dot)} aria-hidden />
            {STATUS_LABEL_TH[s]}
            <b className="text-sm tabular-nums">{formatNumber(counts[s])}</b>
          </li>
        ))}
      </ul>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อพนักงาน"
          aria-label="ค้นหาชื่อพนักงาน"
          className={cn(
            "w-full rounded-full border-2 bg-background py-2.5 pl-10 pr-4 text-sm font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary",
            query ? "border-primary" : "border-border"
          )}
        />
      </label>

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((r) => (
          <FollowUpCard key={r.name} row={r} rank={shown.indexOf(r) + 1} onOpen={onOpen} />
        ))}
      </div>
      {filtered.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">ไม่พบชื่อที่ค้นหา</p>}

      {allRows.length > limit && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onViewAll}
            className="btn-raised inline-flex items-center gap-2 px-5 py-2.5 text-sm font-extrabold text-foreground"
          >
            <Users className="size-4 text-primary" />
            ดูพนักงานทั้งหมด {formatNumber(allRows.length)} คน · ฝ่าย{teamLabel}
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  )
}
