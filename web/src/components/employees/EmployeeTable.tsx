import { useState } from "react"
import { ChevronRight, Search } from "lucide-react"
import type { TeamId } from "@/api/types"
import { TEAM_LABELS } from "@/lib/dashboard-selectors"
import { StatusBadge } from "@/components/kpi/StatusBadge"
import type { KpiStatus } from "@/lib/status"
import { initialsOf } from "@/lib/avatar"
import { colorForName } from "@/lib/avatarColor"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface EmployeeTableRow {
  name: string
  team?: TeamId
  status: KpiStatus
  todayOutput: number | null
  target: number | null
  pctTarget: number | null
  yesterday?: number | null
  monthTotal?: number | null
  lastMonthTotal?: number | null
  /** Consecutive days below target, for risk-sorting/highlighting. */
  consecutiveDaysBelow?: number
  reason?: string
}

interface EmployeeTableProps {
  rows: EmployeeTableRow[]
  onRowClick?: (name: string) => void
  searchable?: boolean
  emptyMessage?: string
}

const numOrDash = (n: number | null | undefined) => (n === null || n === undefined ? "-" : formatNumber(n))

function Avatar({ name }: { name: string }) {
  const color = colorForName(name)
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: color.base }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** Shared employee table — used by the Dashboard follow-up list, the Employees
 * page, and Performance's secondary ranking table. Renders as a real `<table>`
 * from `sm:` up and a stacked card list below it (this app's tables otherwise
 * only ever horizontally-scroll on small screens). */
export function EmployeeTable({ rows, onRowClick, searchable, emptyMessage = "ไม่มีข้อมูล" }: EmployeeTableProps) {
  const [query, setQuery] = useState("")
  const filtered = query.trim() ? rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())) : rows

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div>
      {searchable && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-1.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อพนักงาน..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}

      {/* Desktop/tablet table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-medium">พนักงาน</th>
              <th className="py-2 pr-2 font-medium">สถานะ</th>
              <th className="py-2 pr-2 text-right font-medium">วันนี้</th>
              <th className="py-2 pr-2 text-right font-medium">เป้า</th>
              <th className="py-2 pr-2 text-right font-medium">%</th>
              <th className="py-2 pr-2 text-right font-medium">เมื่อวาน</th>
              <th className="py-2 pr-2 text-right font-medium">เดือนนี้</th>
              <th className="py-2 pr-2 text-right font-medium">เดือนที่แล้ว</th>
              <th className="py-2 pr-2 text-right font-medium">ต่ำกว่าเป้าต่อเนื่อง</th>
              <th className="py-2 pr-2 font-medium">สาเหตุ</th>
              {onRowClick && <th className="py-2 pl-2" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.name}
                className={cn("border-b border-border/60 last:border-0", onRowClick && "cursor-pointer hover:bg-muted/40")}
                onClick={() => onRowClick?.(r.name)}
              >
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.name}</p>
                      {r.team && <p className="text-[11px] text-muted-foreground">{TEAM_LABELS[r.team]}</p>}
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <StatusBadge status={r.status} size="sm" />
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{numOrDash(r.todayOutput)}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{numOrDash(r.target)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.pctTarget === null ? "-" : `${r.pctTarget.toFixed(0)}%`}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{numOrDash(r.yesterday)}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{numOrDash(r.monthTotal)}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{numOrDash(r.lastMonthTotal)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {r.consecutiveDaysBelow ? <span className="text-destructive">{r.consecutiveDaysBelow} วัน</span> : "-"}
                </td>
                <td className="max-w-[220px] truncate py-2 pr-2 text-xs text-muted-foreground">{r.reason ?? "-"}</td>
                {onRowClick && (
                  <td className="py-2 pl-2">
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card stack */}
      <div className="space-y-2 sm:hidden">
        {filtered.map((r) => (
          <div
            key={r.name}
            className={cn("rounded-lg border border-border p-3", onRowClick && "cursor-pointer active:bg-muted/40")}
            onClick={() => onRowClick?.(r.name)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Avatar name={r.name} />
                <div>
                  <p className="text-sm font-medium text-foreground">{r.name}</p>
                  {r.team && <p className="text-[11px] text-muted-foreground">{TEAM_LABELS[r.team]}</p>}
                </div>
              </div>
              <StatusBadge status={r.status} size="sm" />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">วันนี้</p>
                <p className="font-medium tabular-nums text-foreground">{numOrDash(r.todayOutput)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">เป้า</p>
                <p className="font-medium tabular-nums text-foreground">{numOrDash(r.target)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">%</p>
                <p className="font-medium tabular-nums text-foreground">{r.pctTarget === null ? "-" : `${r.pctTarget.toFixed(0)}%`}</p>
              </div>
            </div>
            {r.reason && <p className="mt-2 text-xs text-muted-foreground">{r.reason}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
