import type { Category, DashboardResponse, Employee, EmployeeDailyEntry, TeamId } from "@/api/types"
import { dateFromIso, isoDateOf } from "./format"

/** A person's crew, defaulting to "online" for back-compat with payloads from
 * before the parser split teams (offline employees simply weren't distinguished). */
export function teamOf(employee: Employee): TeamId {
  return employee.team ?? "online"
}

export const TEAM_LABELS: Record<TeamId, string> = {
  online: "ออนไลน์",
  offline: "ออฟไลน์",
  receiving: "ฝ่ายรับเข้า",
  warehouse: "ฝ่ายคลัง",
}

/** Employees on the given crew. */
export function employeesForTeam(employees: Employee[], team: TeamId): Employee[] {
  return employees.filter((e) => teamOf(e) === team)
}

/** True when the payload actually distinguishes an offline crew — lets the UI hide
 * the team switcher entirely on older payloads (pre-parser-split) where everyone is online. */
export function hasOfflineTeam(employees: Employee[]): boolean {
  return employees.some((e) => teamOf(e) === "offline")
}

// ── Department-wide people (attendance / OT) ─────────────────────────────────
// The attendance & OT pages show everyone across all departments — the two
// production crews (ออนไลน์/ออฟไลน์) plus the ฝ่ายรับเข้า/ฝ่ายคลัง staff — with a
// single department filter. This normalises both data shapes into one Employee list.

export const ALL_DEPARTMENTS = "__all_depts__"

export interface DeptEmployee extends Employee {
  department: string
}

/** Department labels that are the ฝ่ายรับเข้า/ฝ่ายคลัง crews (a person's "home"). */
export const RW_DEPARTMENTS = new Set(["ฝ่ายรับเข้า", "ฝ่ายคลัง"])

/**
 * Every person who has (or can have) attendance, tagged with a department, drawn from
 * BOTH shapes the sheet uses: the roster (`employees`, whose `team` now covers all four
 * crews) and the ฝ่ายรับเข้า/ฝ่ายคลัง blocks (`receivingWarehouse`, where value1→parcels
 * and value2→items). People are merged by department+name so the two sources can never
 * double-count, and someone whose home is ฝ่ายรับเข้า/ฝ่ายคลัง is listed under that
 * department only — their production-tab clock-ins (from helping the online/offline
 * line) fold into that one record.
 */
export function buildDepartmentEmployees(data: DashboardResponse): DeptEmployee[] {
  const byKey = new Map<string, DeptEmployee>() // `${department}|${name}`
  const homeDept = new Map<string, string>() // name -> ฝ่ายรับเข้า / ฝ่ายคลัง

  function upsert(name: string, department: string, entries: [string, EmployeeDailyEntry][]) {
    const key = `${department}|${name}`
    let de = byKey.get(key)
    if (!de) {
      de = { name, department, byDate: {}, totalParcels: 0, totalItems: 0 }
      byKey.set(key, de)
    }
    for (const [date, entry] of entries) {
      const cur = de.byDate[date]
      de.byDate[date] = {
        parcels: cur?.parcels ?? entry.parcels ?? null,
        items: cur?.items ?? entry.items ?? null,
        checkIn: cur?.checkIn ?? entry.checkIn ?? null,
        checkOut: cur?.checkOut ?? entry.checkOut ?? null,
      }
    }
    return de
  }

  for (const e of data.employees) {
    const dept = TEAM_LABELS[teamOf(e)]
    upsert(e.name, dept, Object.entries(e.byDate))
    if (RW_DEPARTMENTS.has(dept)) homeDept.set(e.name, dept)
  }

  for (const d of data.receivingWarehouse?.departments ?? []) {
    // Prefer the merged `staff` list; fall back to staffCategories for older payloads.
    const source = d.staff && d.staff.length ? d.staff : d.staffCategories.flatMap((c) => c.employees)
    for (const emp of source) {
      const entries: [string, EmployeeDailyEntry][] = Object.entries(emp.byDate).map(([date, v]) => [
        date,
        { parcels: v.value1, items: v.value2, checkIn: v.checkIn ?? null, checkOut: v.checkOut ?? null },
      ])
      upsert(emp.name, d.title, entries)
      homeDept.set(emp.name, d.title)
    }
  }

  const out: DeptEmployee[] = []
  for (const de of byKey.values()) {
    const home = homeDept.get(de.name)
    if (home && home !== de.department) {
      // Fold this production record into the person's home-department record.
      const target = byKey.get(`${home}|${de.name}`)
      if (target) {
        for (const [date, entry] of Object.entries(de.byDate)) {
          const cur = target.byDate[date]
          target.byDate[date] = {
            parcels: cur?.parcels ?? entry.parcels,
            items: cur?.items ?? entry.items,
            checkIn: cur?.checkIn ?? entry.checkIn ?? null,
            checkOut: cur?.checkOut ?? entry.checkOut ?? null,
          }
        }
        continue
      }
    }
    out.push(de)
  }

  for (const de of out) {
    de.totalParcels = 0
    de.totalItems = 0
    for (const entry of Object.values(de.byDate)) {
      if (typeof entry.parcels === "number") de.totalParcels += entry.parcels
      if (typeof entry.items === "number") de.totalItems += entry.items
    }
  }
  return out
}

/** Distinct department labels present in the data, in a stable display order. */
export function availableDepartments(employees: DeptEmployee[]): string[] {
  const order = ["ออนไลน์", "ออฟไลน์", "ฝ่ายรับเข้า", "ฝ่ายคลัง"]
  const present = new Set(employees.map((e) => e.department))
  const known = order.filter((d) => present.has(d))
  const extra = [...present].filter((d) => !order.includes(d))
  return [...known, ...extra]
}

/** Returns a copy of the employee with byDate/totals restricted to [start, end] (inclusive). */
export function filterEmployeeByDateRange(employee: Employee, start: string, end: string): Employee {
  const byDate: Employee["byDate"] = {}
  let totalParcels = 0
  let totalItems = 0
  for (const [date, entry] of Object.entries(employee.byDate)) {
    if (date < start || date > end) continue
    byDate[date] = entry
    if (typeof entry.parcels === "number") totalParcels += entry.parcels
    if (typeof entry.items === "number") totalItems += entry.items
  }
  return { name: employee.name, team: employee.team, byDate, totalParcels, totalItems }
}

export const ALL_EMPLOYEES_KEY = "__all__"
export const ALL_EMPLOYEES_LABEL = "ทั้งหมด (ทีม)"

/** Builds a synthetic "employee" representing the whole team, so the same per-person
 * chart/table/period-aggregation code can render a team-wide view when "All" is selected. */
export function buildTeamPseudoEmployee(employees: Employee[]): Employee {
  const byDate: Employee["byDate"] = {}
  for (const e of employees) {
    for (const [date, entry] of Object.entries(e.byDate)) {
      const existing = byDate[date]
      byDate[date] = {
        parcels: (existing?.parcels ?? 0) + (entry.parcels ?? 0),
        items: (existing?.items ?? 0) + (entry.items ?? 0),
      }
    }
  }
  let totalParcels = 0
  let totalItems = 0
  Object.values(byDate).forEach((entry) => {
    totalParcels += entry.parcels ?? 0
    totalItems += entry.items ?? 0
  })
  return { name: ALL_EMPLOYEES_LABEL, byDate, totalParcels, totalItems }
}

export interface TeamSummary {
  totalParcels: number
  totalItems: number
  activeDays: number
  avgItemsPerDay: number
  avgParcelsPerDay: number
}

/** Team-wide totals and the team's average output per day it had any activity at all. */
export function computeTeamSummary(employees: Employee[]): TeamSummary {
  let totalParcels = 0
  let totalItems = 0
  const activeDates = new Set<string>()
  for (const e of employees) {
    for (const [date, entry] of Object.entries(e.byDate)) {
      if (typeof entry.parcels === "number") totalParcels += entry.parcels
      if (typeof entry.items === "number") totalItems += entry.items
      if ((entry.parcels ?? 0) > 0 || (entry.items ?? 0) > 0) activeDates.add(date)
    }
  }
  const activeDays = activeDates.size
  return {
    totalParcels,
    totalItems,
    activeDays,
    avgItemsPerDay: activeDays > 0 ? totalItems / activeDays : 0,
    avgParcelsPerDay: activeDays > 0 ? totalParcels / activeDays : 0,
  }
}

export interface DatePreset {
  label: string
  start: string
  end: string
}

export function addDays(iso: string, days: number): string {
  const d = dateFromIso(iso)
  d.setDate(d.getDate() + days)
  return isoDateOf(d)
}

function startOfMonth(iso: string): string {
  const d = dateFromIso(iso)
  return isoDateOf(new Date(d.getFullYear(), d.getMonth(), 1))
}

function startOfYear(iso: string): string {
  const d = dateFromIso(iso)
  return isoDateOf(new Date(d.getFullYear(), 0, 1))
}

/** Quick date-range shortcuts, anchored on the app's notion of "today" (latest active date in the sheet)
 * rather than the real calendar date, and clamped to not start before the earliest available data. */
export function getDatePresets(todayDate: string, minDate: string): DatePreset[] {
  const lastMonthEnd = addDays(startOfMonth(todayDate), -1)
  const lastMonthStart = startOfMonth(lastMonthEnd)
  const clampStart = (start: string) => (start < minDate ? minDate : start)

  return [
    { label: "วันนี้", start: todayDate, end: todayDate },
    { label: "เมื่อวาน", start: clampStart(addDays(todayDate, -1)), end: addDays(todayDate, -1) },
    { label: "7 วันล่าสุด", start: clampStart(addDays(todayDate, -6)), end: todayDate },
    { label: "30 วันล่าสุด", start: clampStart(addDays(todayDate, -29)), end: todayDate },
    { label: "เดือนนี้", start: clampStart(startOfMonth(todayDate)), end: todayDate },
    { label: "เดือนที่แล้ว", start: clampStart(lastMonthStart), end: lastMonthEnd },
    { label: "ปีนี้", start: clampStart(startOfYear(todayDate)), end: todayDate },
  ]
}

export function getTeamTotalForDate(data: DashboardResponse, date: string) {
  return data.teamTotalsByDate[date] ?? { parcels: 0, items: 0, activeEmployees: 0 }
}

/** Recomputes per-date team totals from an arbitrary employee subset — used to
 * re-scope teamTotalsByDate/monthlyTotals to the currently selected crew. Mirrors
 * the Apps Script aggregation (activeEmployees counts only those with output that day). */
export function computeTeamTotalsByDate(
  employees: Employee[],
  dates: string[]
): DashboardResponse["teamTotalsByDate"] {
  const out: DashboardResponse["teamTotalsByDate"] = {}
  for (const date of dates) {
    let parcels = 0
    let items = 0
    let active = 0
    for (const e of employees) {
      const entry = e.byDate[date]
      if (!entry) continue
      if (typeof entry.parcels === "number") parcels += entry.parcels
      if (typeof entry.items === "number") items += entry.items
      if ((entry.parcels ?? 0) > 0 || (entry.items ?? 0) > 0) active += 1
    }
    out[date] = { parcels, items, activeEmployees: active }
  }
  return out
}

/** The calendar day immediately before the given ISO date, for day-over-day comparisons. */
export function getPreviousDate(date: string): string {
  return addDays(date, -1)
}

/** Percent change from `previous` to `current`. Null when there's no meaningful baseline (both zero). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : 100
  return ((current - previous) / previous) * 100
}

export function getTargetAchievementPercent(data: DashboardResponse, targetOverride?: number | null): number | null {
  const target = targetOverride ?? data.target?.value
  if (!target) return null
  const today = getTeamTotalForDate(data, data.todayDate)
  if (today.activeEmployees === 0) return null
  const avgItems = today.items / today.activeEmployees
  return (avgItems / target) * 100
}

export function findCategory(categories: Category[], titleIncludes: string): Category | undefined {
  return categories.find((c) => c.title.indexOf(titleIncludes) !== -1)
}

/** Counts non-blank, non-zero byDate entries across a category's rows, restricted to the given dates.
 * Text like "0 ชิ้น" or "0 ออเดอร์" counts as compliant (zero), not an entry. */
export function countCategoryEntries(category: Category | undefined, dates: string[]): number {
  if (!category) return 0
  const dateSet = new Set(dates)
  let count = 0
  for (const row of category.rows) {
    for (const [date, value] of Object.entries(row.byDate)) {
      const trimmed = value?.trim()
      if (!dateSet.has(date) || !trimmed) continue
      if (parseLeadingNumber(trimmed) === 0) continue
      count += 1
    }
  }
  return count
}

export function datesInMonth(dates: string[], monthKey: string): string[] {
  return dates.filter((d) => d.startsWith(monthKey))
}

export function monthKeyOf(dateIso: string): string {
  return dateIso.slice(0, 7)
}

/** Ranking is by parcels first, items as the tiebreaker — matches the rest of the app's ranking rule. */
export function rankEmployeesForDate(employees: Employee[], date: string) {
  return employees
    .map((e) => ({ name: e.name, items: e.byDate[date]?.items ?? null, parcels: e.byDate[date]?.parcels ?? null }))
    .filter((e) => e.items !== null || e.parcels !== null)
    .sort((a, b) => (b.parcels ?? 0) - (a.parcels ?? 0) || (b.items ?? 0) - (a.items ?? 0))
}

export function recentDates(dates: string[], count: number): string[] {
  return [...dates].sort().slice(-count).reverse()
}

export type ReportPeriod = "day" | "month" | "year"

export interface PeriodBucket {
  key: string
  parcels: number
  items: number
  /** Number of dates rolled into this bucket that had any recorded entry. */
  activeDays: number
}

function periodKeyOf(date: string, period: ReportPeriod): string {
  if (period === "year") return date.slice(0, 4)
  if (period === "month") return date.slice(0, 7)
  return date
}

/** Rolls an employee's daily entries up into day/month/year buckets, sorted chronologically. */
export function aggregateEmployeeByPeriod(employee: Employee, period: ReportPeriod): PeriodBucket[] {
  const buckets = new Map<string, PeriodBucket>()
  for (const [date, entry] of Object.entries(employee.byDate)) {
    const key = periodKeyOf(date, period)
    const bucket = buckets.get(key) ?? { key, parcels: 0, items: 0, activeDays: 0 }
    if (typeof entry.parcels === "number") bucket.parcels += entry.parcels
    if (typeof entry.items === "number") bucket.items += entry.items
    if ((entry.parcels ?? 0) > 0 || (entry.items ?? 0) > 0) bucket.activeDays += 1
    buckets.set(key, bucket)
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export interface EmployeeRankEntry {
  name: string
  totalItems: number
  totalParcels: number
  rank: number
}

/** Ranks employees by total parcels first, total items as the tiebreaker — independent of any single date. */
export function rankEmployeesByTotal(employees: Employee[]): EmployeeRankEntry[] {
  return [...employees]
    .sort((a, b) => b.totalParcels - a.totalParcels || b.totalItems - a.totalItems)
    .map((e, i) => ({ name: e.name, totalItems: e.totalItems, totalParcels: e.totalParcels, rank: i + 1 }))
}

export interface Incident {
  date: string
  categoryId: string
  categoryTitle: string
  label: string
  note?: string
  text: string
}

/** Extracts the first number in a free-text cell (e.g. "0 ชิ้น" -> 0, "5 ออเดอร์" -> 5). Returns null if no number is present. */
export function parseLeadingNumber(text: string): number | null {
  const match = text.match(/(\d+(\.\d+)?)/)
  return match ? Number(match[1]) : null
}

/** Flattens every non-blank, non-zero entry across all compliance categories (2-6) into a single incident feed.
 * Text like "0 ชิ้น" or "0 ออเดอร์" is treated as compliant (not an incident) even though it isn't the bare string "0". */
export function collectIncidents(data: DashboardResponse): Incident[] {
  const incidents: Incident[] = []
  for (const category of data.categories) {
    for (const row of category.rows) {
      for (const [date, text] of Object.entries(row.byDate)) {
        const trimmed = text?.trim()
        if (!trimmed) continue
        const numeric = parseLeadingNumber(trimmed)
        if (numeric === 0) continue
        incidents.push({ date, categoryId: category.id, categoryTitle: category.title, label: row.label, note: row.note, text: trimmed })
      }
    }
  }
  return incidents.sort((a, b) => b.date.localeCompare(a.date))
}

export interface CategoryCount {
  categoryId: string
  categoryTitle: string
  count: number
}

export function countIncidentsByCategory(incidents: Incident[]): CategoryCount[] {
  const counts = new Map<string, CategoryCount>()
  for (const inc of incidents) {
    const existing = counts.get(inc.categoryId)
    if (existing) existing.count += 1
    else counts.set(inc.categoryId, { categoryId: inc.categoryId, categoryTitle: inc.categoryTitle, count: 1 })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

export type KpiGrade = "A" | "B" | "C" | "D"

export interface KpiEvaluation {
  name: string
  totalParcels: number
  totalItems: number
  activeDays: number
  avgParcelsPerDay: number
  avgItemsPerDay: number
  /** Output vs target, as a percentage, capped at 100 (hitting or exceeding target both score full marks —
   * KPI is out of 100% per month, not an open-ended multiple of target). Output is (avg parcels + avg items) per working day. */
  achievementPct: number
  /** Points deducted for team-wide incidents in the period — shared equally, since the
   * sheet's error/CN/lost-item entries are not attributed to individual employees. */
  penaltyPoints: number
  /** achievementPct - penaltyPoints, floored at 0. */
  score: number
  grade: KpiGrade
}

export function gradeForScore(score: number): KpiGrade {
  if (score >= 100) return "A"
  if (score >= 80) return "B"
  if (score >= 60) return "C"
  return "D"
}

/** First N team incidents per month are forgiven (no deduction) — only crossing this threshold triggers a penalty. */
export const FREE_INCIDENT_ALLOWANCE = 4

/**
 * Flat deduction once team incidents for the month exceed the free allowance — NOT multiplied by
 * how many incidents there are. E.g. with penaltyPerIncident=5: 0-4 incidents = 0% deducted,
 * 5+ incidents = a flat 5% deducted (not 5%, 10%, 15%... scaling per incident).
 */
export function computeIncidentPenalty(incidentCount: number, penaltyPerIncident: number): number {
  return incidentCount > FREE_INCIDENT_ALLOWANCE ? penaltyPerIncident : 0
}

/**
 * Per-employee KPI score for a period: achievement-vs-target (capped at 100 — KPI is out of 100%
 * per month, not an open-ended multiple of target) minus a flat penalty once team incidents in the
 * period cross the free allowance. The penalty is intentionally the SAME for every active employee
 * (not divided or weighted) because the sheet has no way to tell who caused a given error/CN/lost-item entry.
 */
export function computeKpiEvaluations(
  employees: Employee[],
  targetValue: number | null,
  incidentCount: number,
  penaltyPerIncident: number
): KpiEvaluation[] {
  const penaltyPoints = computeIncidentPenalty(incidentCount, penaltyPerIncident)

  return employees
    .map((e) => {
      const activeDays = Object.values(e.byDate).filter((d) => (d.parcels ?? 0) > 0 || (d.items ?? 0) > 0).length
      const avgParcelsPerDay = activeDays > 0 ? e.totalParcels / activeDays : 0
      const avgItemsPerDay = activeDays > 0 ? e.totalItems / activeDays : 0
      const achievementPct = targetValue ? Math.min(100, ((avgParcelsPerDay + avgItemsPerDay) / targetValue) * 100) : 0
      const score = Math.max(0, achievementPct - penaltyPoints)
      return {
        name: e.name,
        totalParcels: e.totalParcels,
        totalItems: e.totalItems,
        activeDays,
        avgParcelsPerDay,
        avgItemsPerDay,
        achievementPct,
        penaltyPoints,
        score,
        grade: gradeForScore(score),
      }
    })
    .filter((e) => e.activeDays > 0)
    .sort((a, b) => b.score - a.score)
}

/**
 * Single team-wide KPI evaluation, normalized the same way as an individual: for each day the team
 * had any activity, output is averaged per active employee that day (not just summed), then averaged
 * across active days — so the team score is directly comparable to an individual's score against the
 * same per-person target, rather than inflated by headcount.
 */
export function computeTeamKpiEvaluation(
  employees: Employee[],
  targetValue: number | null,
  incidentCount: number,
  penaltyPerIncident: number
): KpiEvaluation {
  const byDate = new Map<string, { parcels: number; items: number; activeCount: number }>()
  for (const e of employees) {
    for (const [date, entry] of Object.entries(e.byDate)) {
      const parcels = entry.parcels ?? 0
      const items = entry.items ?? 0
      if (parcels <= 0 && items <= 0) continue
      const bucket = byDate.get(date) ?? { parcels: 0, items: 0, activeCount: 0 }
      bucket.parcels += parcels
      bucket.items += items
      bucket.activeCount += 1
      byDate.set(date, bucket)
    }
  }

  const days = [...byDate.values()]
  const activeDays = days.length
  const avgParcelsPerDay = activeDays > 0 ? days.reduce((s, d) => s + d.parcels / d.activeCount, 0) / activeDays : 0
  const avgItemsPerDay = activeDays > 0 ? days.reduce((s, d) => s + d.items / d.activeCount, 0) / activeDays : 0
  const achievementPct = targetValue ? Math.min(100, ((avgParcelsPerDay + avgItemsPerDay) / targetValue) * 100) : 0
  const penaltyPoints = computeIncidentPenalty(incidentCount, penaltyPerIncident)
  const score = Math.max(0, achievementPct - penaltyPoints)

  return {
    name: ALL_EMPLOYEES_LABEL,
    totalParcels: employees.reduce((s, e) => s + e.totalParcels, 0),
    totalItems: employees.reduce((s, e) => s + e.totalItems, 0),
    activeDays,
    avgParcelsPerDay,
    avgItemsPerDay,
    achievementPct,
    penaltyPoints,
    score,
    grade: gradeForScore(score),
  }
}

export interface RankPoint {
  key: string
  rank: number
  items: number
  parcels: number
}

/** For each period (day/month/year), ranks only the employees active that period — by parcels first,
 * items as the tiebreaker — so a person's line naturally gaps during periods they didn't work rather
 * than falsely showing last place. */
export function getEmployeeRankHistory(employees: Employee[], period: ReportPeriod): Record<string, RankPoint[]> {
  const perEmployee = employees.map((e) => ({ name: e.name, buckets: aggregateEmployeeByPeriod(e, period) }))
  const keySet = new Set<string>()
  perEmployee.forEach((e) => e.buckets.forEach((b) => keySet.add(b.key)))
  const keys = [...keySet].sort()

  const history: Record<string, RankPoint[]> = {}
  employees.forEach((e) => { history[e.name] = [] })

  keys.forEach((key) => {
    const active = perEmployee
      .map((e) => {
        const bucket = e.buckets.find((b) => b.key === key)
        return { name: e.name, items: bucket?.items ?? 0, parcels: bucket?.parcels ?? 0 }
      })
      .filter((e) => e.parcels > 0 || e.items > 0)
      .sort((a, b) => b.parcels - a.parcels || b.items - a.items)

    active.forEach((e, i) => {
      history[e.name]?.push({ key, rank: i + 1, items: e.items, parcels: e.parcels })
    })
  })

  return history
}

export interface MonthlyCategoryTrend {
  months: string[]
  categories: { id: string; title: string }[]
  seriesByCategory: Record<string, number[]>
}

/** Pivots incidents into a month x category grid for a stacked-trend chart. */
export function incidentsByMonthAndCategory(incidents: Incident[]): MonthlyCategoryTrend {
  const monthSet = new Set<string>()
  const categoryMap = new Map<string, string>()
  const counts = new Map<string, number>()

  for (const inc of incidents) {
    const month = inc.date.slice(0, 7)
    monthSet.add(month)
    categoryMap.set(inc.categoryId, inc.categoryTitle)
    const key = `${month}|${inc.categoryId}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const months = [...monthSet].sort()
  const categories = [...categoryMap.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.id.localeCompare(b.id))
  const seriesByCategory: Record<string, number[]> = {}
  for (const cat of categories) {
    seriesByCategory[cat.id] = months.map((m) => counts.get(`${m}|${cat.id}`) ?? 0)
  }

  return { months, categories, seriesByCategory }
}
