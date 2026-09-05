import type { DashboardResponse, Employee } from "@/api/types"
import { addDays, filterEmployeeByDateRange } from "./dashboard-selectors"
import { hasNoPrimaryParcelTarget } from "./employeeRoles"

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

/**
 * Order-count-based counterpart of DailyWorkforceStat/RangeWorkforceStat, for the
 * offline crew: it's wholesale, so per-order workload (not per-parcel) is the right
 * unit — see hasNoPrimaryParcelTarget's doc for the same "offline ≠ online" reasoning.
 * Workload comes from the "รายงานคำสั่งซื้อ" offline channel (orderReport.days),
 * NOT from employees[].totalParcels; headcount still comes from real attendance
 * (isActiveEntry), since order count isn't tracked per person.
 */
export interface DailyOrderWorkforceStat {
  date: string
  totalOrders: number
  activeEmployeeCount: number
  actualProductivity: number
  target: number
  requiredHeadcount: number
  gap: number
  status: WorkforceStatus
}

function offlineOrderDay(data: DashboardResponse, date: string) {
  return (data.orderReport?.days ?? []).find((d) => d.date === date && d.channel === "offline")
}

export function computeDailyOrderWorkforceStat(data: DashboardResponse, date: string, targetOrdersPerPerson: number): DailyOrderWorkforceStat {
  const totalOrders = offlineOrderDay(data, date)?.totalOrders ?? 0
  let activeEmployeeCount = 0
  for (const e of data.employees) {
    const entry = e.byDate[date]
    if (entry && isActiveEntry(entry.parcels, entry.items)) activeEmployeeCount += 1
  }
  const actualProductivity = activeEmployeeCount > 0 ? totalOrders / activeEmployeeCount : 0
  const requiredHeadcount = targetOrdersPerPerson > 0 ? Math.ceil(totalOrders / targetOrdersPerPerson) : 0
  const gap = requiredHeadcount - activeEmployeeCount
  return { date, totalOrders, activeEmployeeCount, actualProductivity, target: targetOrdersPerPerson, requiredHeadcount, gap, status: statusFor(gap) }
}

export interface RangeOrderWorkforceStat {
  totalOrders: number
  uniqueDays: number
  avgActiveEmployeesPerDay: number
  avgOrdersPerDay: number
  actualProductivity: number
  target: number
  requiredHeadcount: number
  currentHeadcount: number
  gap: number
  status: WorkforceStatus
}

/** Days without an offline order-report row are skipped from the average (matches
 * computeRangeWorkforceStat's "don't count no-data days" convention). */
export function computeRangeOrderWorkforceStat(data: DashboardResponse, start: string, end: string, targetOrdersPerPerson: number): RangeOrderWorkforceStat {
  const orderDays = (data.orderReport?.days ?? []).filter((d) => d.channel === "offline" && d.date >= start && d.date <= end)
  const totalOrders = orderDays.reduce((s, d) => s + d.totalOrders, 0)
  const uniqueDays = orderDays.length

  let personDays = 0
  const activeDays = new Set<string>()
  for (const e of data.employees) {
    for (const [date, entry] of Object.entries(e.byDate)) {
      if (date < start || date > end) continue
      if (isActiveEntry(entry.parcels, entry.items)) {
        personDays += 1
        activeDays.add(date)
      }
    }
  }

  const avgActiveEmployeesPerDay = activeDays.size > 0 ? personDays / activeDays.size : 0
  const avgOrdersPerDay = uniqueDays > 0 ? totalOrders / uniqueDays : 0
  const actualProductivity = avgActiveEmployeesPerDay > 0 ? avgOrdersPerDay / avgActiveEmployeesPerDay : 0
  const requiredHeadcount = targetOrdersPerPerson > 0 ? Math.ceil(avgOrdersPerDay / targetOrdersPerPerson) : 0
  const currentHeadcount = Math.round(avgActiveEmployeesPerDay)
  const gap = requiredHeadcount - currentHeadcount
  return {
    totalOrders,
    uniqueDays,
    avgActiveEmployeesPerDay,
    avgOrdersPerDay,
    actualProductivity,
    target: targetOrdersPerPerson,
    requiredHeadcount,
    currentHeadcount,
    gap,
    status: statusFor(gap),
  }
}

export function computeDailyOrderWorkforceSeries(data: DashboardResponse, dates: string[], targetOrdersPerPerson: number): DailyOrderWorkforceStat[] {
  return dates.map((d) => computeDailyOrderWorkforceStat(data, d, targetOrdersPerPerson))
}

export interface EmployeeMetric {
  name: string
  parcels: number
  items: number
  activeDays: number
  /** Parcels per day actually worked — the per-person "productivity" figure. */
  productivity: number
  /** null for employees whose primary duty isn't parcel fulfillment (see
   * hasNoPrimaryParcelTarget) — they still show real parcels/items above, just
   * never a %-of-target figure, since parcel target isn't their KPI. */
  pctTarget: number | null
}

/** Only employees with at least one active day in range count — matches "ห้ามนำคนที่ไม่มีข้อมูลมานับ". */
export function computeEmployeeMetrics(employees: Employee[], start: string, end: string, targetPerPerson: number): EmployeeMetric[] {
  return employees
    .map((e) => filterEmployeeByDateRange(e, start, end))
    .map((e) => {
      const activeDays = Object.values(e.byDate).filter((d) => isActiveEntry(d.parcels, d.items)).length
      const productivity = activeDays > 0 ? e.totalParcels / activeDays : 0
      const pctTarget = hasNoPrimaryParcelTarget(e.name) ? null : targetPerPerson > 0 ? (productivity / targetPerPerson) * 100 : 0
      return { name: e.name, parcels: e.totalParcels, items: e.totalItems, activeDays, productivity, pctTarget }
    })
    .filter((m) => m.activeDays > 0)
}

export type RankingMetric = "parcels" | "items" | "productivity" | "pctTarget"

export interface RankedEmployeeMetric extends EmployeeMetric {
  rank: number
}

/** Ranking by "pctTarget" silently drops employees with no primary parcel target (see
 * EmployeeMetric.pctTarget) — parcel work isn't their KPI, so they have nothing to rank
 * there, but they still appear when ranking by the raw parcels/items/productivity metrics. */
export function rankByMetric(metrics: EmployeeMetric[], metric: RankingMetric): RankedEmployeeMetric[] {
  const rankable = metric === "pctTarget" ? metrics.filter((m) => m.pctTarget !== null) : metrics
  return [...rankable].sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0)).map((m, i) => ({ ...m, rank: i + 1 }))
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
