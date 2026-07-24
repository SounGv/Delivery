import type { DashboardResponse, Employee } from "@/api/types"
import { addDays, filterEmployeeByDateRange } from "./dashboard-selectors"

/** "Working" means real logged output that day — a present-but-zero entry does not count,
 * matching the rest of the app's convention (see LiveWarehouse's isActiveToday). */
export function isActiveEntry(parcels: number | null | undefined, items: number | null | undefined): boolean {
  return (parcels ?? 0) > 0 || (items ?? 0) > 0
}

export type WorkforceStatus = "ok" | "watch" | "shortage"

function statusFor(gap: number): WorkforceStatus {
  if (gap > 0) return "shortage"
  if (gap < 0) return "watch"
  return "ok"
}

export interface DailyWorkforceStat {
  date: string
  totalParcels: number
  totalItems: number
  activeEmployeeCount: number
  actualProductivity: number
  target: number
  requiredHeadcount: number
  gap: number
  status: WorkforceStatus
}

/** Single-day workforce snapshot — required headcount is CEILING(parcels ÷ target), matching the
 * "orders ÷ target productivity" formula given for Workforce Planning (parcels, not parcels+items). */
export function computeDailyWorkforceStat(data: DashboardResponse, date: string, targetPerPerson: number): DailyWorkforceStat {
  let totalParcels = 0
  let totalItems = 0
  let activeEmployeeCount = 0
  for (const e of data.employees) {
    const entry = e.byDate[date]
    if (entry && isActiveEntry(entry.parcels, entry.items)) {
      totalParcels += entry.parcels ?? 0
      totalItems += entry.items ?? 0
      activeEmployeeCount += 1
    }
  }
  const actualProductivity = activeEmployeeCount > 0 ? totalParcels / activeEmployeeCount : 0
  const requiredHeadcount = targetPerPerson > 0 ? Math.ceil(totalParcels / targetPerPerson) : 0
  const gap = requiredHeadcount - activeEmployeeCount
  return { date, totalParcels, totalItems, activeEmployeeCount, actualProductivity, target: targetPerPerson, requiredHeadcount, gap, status: statusFor(gap) }
}

export interface RangeWorkforceStat {
  totalParcels: number
  totalItems: number
  uniqueDays: number
  avgActiveEmployeesPerDay: number
  avgParcelsPerDay: number
  actualProductivity: number
  target: number
  requiredHeadcount: number
  currentHeadcount: number
  gap: number
  status: WorkforceStatus
}

/** Same formula applied to a typical day within the range — averages headcount by real
 * person-days worked, never by the cumulative distinct-name count (which over a wide range
 * hugely overstates how many people actually show up on any given day). */
export function computeRangeWorkforceStat(data: DashboardResponse, start: string, end: string, targetPerPerson: number): RangeWorkforceStat {
  let totalParcels = 0
  let totalItems = 0
  let personDays = 0
  const days = new Set<string>()
  for (const e of data.employees) {
    for (const [date, entry] of Object.entries(e.byDate)) {
      if (date < start || date > end) continue
      if (isActiveEntry(entry.parcels, entry.items)) {
        totalParcels += entry.parcels ?? 0
        totalItems += entry.items ?? 0
        personDays += 1
        days.add(date)
      }
    }
  }
  const uniqueDays = days.size
  const avgActiveEmployeesPerDay = uniqueDays > 0 ? personDays / uniqueDays : 0
  const avgParcelsPerDay = uniqueDays > 0 ? totalParcels / uniqueDays : 0
  const actualProductivity = personDays > 0 ? totalParcels / personDays : 0
  const requiredHeadcount = targetPerPerson > 0 ? Math.ceil(avgParcelsPerDay / targetPerPerson) : 0
  const currentHeadcount = Math.round(avgActiveEmployeesPerDay)
  const gap = requiredHeadcount - currentHeadcount
  return {
    totalParcels,
    totalItems,
    uniqueDays,
    avgActiveEmployeesPerDay,
    avgParcelsPerDay,
    actualProductivity,
    target: targetPerPerson,
    requiredHeadcount,
    currentHeadcount,
    gap,
    status: statusFor(gap),
  }
}

/** Per-day series across a range — feeds the Workload Analytics charts and the daily table. */
export function computeDailyWorkforceSeries(data: DashboardResponse, dates: string[], targetPerPerson: number): DailyWorkforceStat[] {
  return dates.map((d) => computeDailyWorkforceStat(data, d, targetPerPerson))
}

export interface EmployeeMetric {
  name: string
  parcels: number
  items: number
  activeDays: number
  /** Parcels per day actually worked — the per-person "productivity" figure. */
  productivity: number
  pctTarget: number
}

/** Only employees with at least one active day in range count — matches "ห้ามนำคนที่ไม่มีข้อมูลมานับ". */
export function computeEmployeeMetrics(employees: Employee[], start: string, end: string, targetPerPerson: number): EmployeeMetric[] {
  return employees
    .map((e) => filterEmployeeByDateRange(e, start, end))
    .map((e) => {
      const activeDays = Object.values(e.byDate).filter((d) => isActiveEntry(d.parcels, d.items)).length
      const productivity = activeDays > 0 ? e.totalParcels / activeDays : 0
      const pctTarget = targetPerPerson > 0 ? (productivity / targetPerPerson) * 100 : 0
      return { name: e.name, parcels: e.totalParcels, items: e.totalItems, activeDays, productivity, pctTarget }
    })
    .filter((m) => m.activeDays > 0)
}

export type RankingMetric = "parcels" | "items" | "productivity" | "pctTarget"

export interface RankedEmployeeMetric extends EmployeeMetric {
  rank: number
}

export function rankByMetric(metrics: EmployeeMetric[], metric: RankingMetric): RankedEmployeeMetric[] {
  return [...metrics].sort((a, b) => b[metric] - a[metric]).map((m, i) => ({ ...m, rank: i + 1 }))
}

/** Rank-change vs. the equal-length preceding period, keyed by employee name. Employees absent
 * from the previous period simply get no delta (spec: don't show a change with no baseline). */
export function computeRankDeltas(
  currentRanking: RankedEmployeeMetric[],
  previousRanking: RankedEmployeeMetric[]
): Map<string, number> {
  const prevRank = new Map(previousRanking.map((m) => [m.name, m.rank]))
  const deltas = new Map<string, number>()
  for (const m of currentRanking) {
    const prev = prevRank.get(m.name)
    if (prev !== undefined) deltas.set(m.name, prev - m.rank)
  }
  return deltas
}

/** The equal-length window immediately before [start, end], for rank-change comparisons. */
export function previousWindow(start: string, end: string): { start: string; end: string } {
  const spanDays = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(spanDays - 1))
  return { start: prevStart, end: prevEnd }
}
