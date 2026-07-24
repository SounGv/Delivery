import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { useTeamDashboard } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { formatDateLabel, formatNumber } from "@/lib/format"
import { initialsOf } from "@/lib/avatar"

interface ActivityRow {
  date: string
  employee: string
  parcels: number | null
  items: number | null
}

export function Activity() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const [search, setSearch] = useState("")

  const rows = useMemo<ActivityRow[]>(() => {
    if (!data) return []
    const flat: ActivityRow[] = []
    for (const employee of data.employees) {
      for (const [date, entry] of Object.entries(employee.byDate)) {
        if (entry.parcels !== null || entry.items !== null) {
          flat.push({ date, employee: employee.name, parcels: entry.parcels, items: entry.items })
        }
      }
    }
    return flat.sort((a, b) => (b.date === a.date ? (b.items ?? 0) - (a.items ?? 0) : b.date.localeCompare(a.date)))
  }, [data])

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const filtered = search.trim() ? rows.filter((r) => r.employee.includes(search.trim())) : rows

  return (
    <div className="space-y-4">
      <div className="glass-panel flex items-center gap-2 rounded-2xl p-3">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อพนักงาน..."
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} รายการ</span>
      </div>

      <div className="glass-panel max-h-[70vh] overflow-y-auto rounded-2xl p-2">
        <div className="divide-y divide-white/5">
          {filtered.map((r, idx) => (
            <div key={`${r.date}-${r.employee}-${idx}`} className="flex items-center gap-3 px-2 py-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-emerald-glow text-xs font-semibold text-white">
                {initialsOf(r.employee)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{r.employee}</p>
                <p className="text-xs text-muted-foreground">{formatDateLabel(r.date)} · {r.date}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-foreground">{formatNumber(r.items)} ชิ้น</p>
                <p className="text-xs text-muted-foreground">{formatNumber(r.parcels)} พัสดุ</p>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบข้อมูล</p>
          )}
        </div>
      </div>
    </div>
  )
}
