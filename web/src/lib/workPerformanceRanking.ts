import type { WorkPerformanceEmployee, WorkPerformanceMetrics } from "@/api/types"
import type { EmployeeMetric } from "@/lib/workforce"

/**
 * "พัสดุ" (total parcel-touches across the whole fulfilment flow: pick → pack →
 * inspect → ship). Earlier this was พิมพ์ใบปะหน้า + PDA หยิบของ, but checking
 * real totals showed those two are near-duplicates of จำนวนรวมพัสดุที่หยิบ
 * itself (same picking activity measured two ways, off by only a few units per
 * person) — summing them double-counted picking and completely ignored anyone
 * who mostly packs or ships (e.g. one person with 6,700+ จัดส่ง but under 250
 * picks ranked near the bottom). จำนวนพัสดุทั้งหมดที่คัดแยก is always 0 in this
 * warehouse's export (never used) so it's omitted, not because it's excluded on
 * principle.
 */
export function dailyParcelTotal(m: WorkPerformanceMetrics): number {
  return m.pickParcels + m.packParcels + m.inspectParcels + m.ship
}

/** "สินค้า" — distinct SKUs touched across pick/pack/inspect. */
export function dailyItemTotal(m: WorkPerformanceMetrics): number {
  return m.pickSku + m.packSku + m.inspectSku
}

/** "Wave" — a work-batch BigSeller groups orders into; counted across every
 * stage that creates its own wave (pick/sort/pack/inspect). */
export function dailyWaveTotal(m: WorkPerformanceMetrics): number {
  return m.pickWaveCount + m.sortWaveCount + m.packWaveCount + m.inspectWaveCount
}

/** Sums one composite metric (dailyParcelTotal, dailyItemTotal, ...) for a
 * single employee over an arbitrary date range — the range-aware replacement
 * for reading `emp.totals[key]`, which is always whole-dataset. */
export function sumEmployeeMetricInRange(
  emp: WorkPerformanceEmployee,
  dates: string[],
  metricFn: (m: WorkPerformanceMetrics) => number
): number {
  let total = 0
  for (const d of dates) {
    const m = emp.byDate[d]
    if (m) total += metricFn(m)
  }
  return total
}

/**
 * Feeds the same ranking system already used for the online team (Podium/
 * RankingList/rankByMetric/computeRankDeltas — see lib/workforce.ts) with
 * BigSeller-sourced work-performance data instead of the legacy manually-typed
 * employee sheet. Nothing in workforce.ts had to change: EmployeeMetric is a
 * plain data shape, not tied to the old Employee type.
 */
export function computeWpEmployeeMetrics(
  employees: WorkPerformanceEmployee[],
  dates: string[],
  targetPerPerson: number
): EmployeeMetric[] {
  return employees
    .map((e) => {
      let parcels = 0
      let items = 0
      let activeDays = 0
      for (const d of dates) {
        const m = e.byDate[d]
        if (!m) continue
        const dayParcels = dailyParcelTotal(m)
        if (dayParcels > 0) activeDays += 1
        parcels += dayParcels
        items += dailyItemTotal(m)
      }
      const productivity = activeDays > 0 ? parcels / activeDays : 0
      const pctTarget = targetPerPerson > 0 ? (productivity / targetPerPerson) * 100 : null
      return { name: e.name, parcels, items, activeDays, productivity, pctTarget }
    })
    .filter((m) => m.activeDays > 0)
}

export interface DailyComparisonRow {
  operator: string
  name: string
  department: string
  today: number
  yesterday: number
  /** null when there's no "yesterday" figure to compare against (0, or missing that day). */
  pctChange: number | null
  /** Today's raw BigSeller columns, named exactly as the sheet does — shown
   * directly on the page so "พัสดุรวม" is never a mystery number: it's visibly
   * built from these real columns, not some opaque derived figure. Every
   * column is shown for every employee regardless of department: a ฝ่ายคลัง
   * person can have a real (non-zero) pick column on a day they helped
   * ฝ่ายออนไลน์/ออฟไลน์, and vice versa. */
  todayPdaPick: number
  todayPrintLabel: number
  todayPickWaveCount: number
  todayPickSku: number
  todayTransferDocs: number
  todayReplenishDocs: number
}

/** Per-employee today-vs-yesterday comparison (พัสดุ = dailyParcelTotal), for
 * the two most recent dates the sheet actually has — "today"/"yesterday" here
 * mean the latest two dates PRESENT in the data, not the real calendar date,
 * since a fresh BigSeller pull can lag behind. */
export function computeWpDailyComparison(employees: WorkPerformanceEmployee[], sortedDates: string[]): DailyComparisonRow[] {
  const today = sortedDates[sortedDates.length - 1]
  const yesterday = sortedDates[sortedDates.length - 2]
  if (!today) return []
  return employees
    .map((e) => {
      const todayMetrics = e.byDate[today] ?? zeroMetrics
      const todayVal = dailyParcelTotal(todayMetrics)
      const yesterdayVal = yesterday ? dailyParcelTotal(e.byDate[yesterday] ?? zeroMetrics) : 0
      const pctChange = yesterday && yesterdayVal > 0 ? ((todayVal - yesterdayVal) / yesterdayVal) * 100 : null
      return {
        operator: e.operator,
        name: e.name,
        department: e.department,
        today: todayVal,
        yesterday: yesterdayVal,
        pctChange,
        todayPdaPick: todayMetrics.pdaPick,
        todayPrintLabel: todayMetrics.printLabel,
        todayPickWaveCount: todayMetrics.pickWaveCount,
        todayPickSku: todayMetrics.pickSku,
        todayTransferDocs: todayMetrics.transferDocs,
        todayReplenishDocs: todayMetrics.replenishDocs,
      }
    })
    .filter((r) => r.today > 0 || r.yesterday > 0 || r.todayTransferDocs > 0 || r.todayReplenishDocs > 0)
}

export interface DailyTrendRow {
  date: string
  parcels: number
  items: number
  waves: number
}

/** Day-by-day totals across the given employees (already scoped to whichever
 * department/person filter is active) — feeds the "วันต่อวัน" trend chart. */
export function computeWpDailyTrend(employees: WorkPerformanceEmployee[], dates: string[]): DailyTrendRow[] {
  return dates.map((date) => {
    let parcels = 0
    let items = 0
    let waves = 0
    for (const e of employees) {
      const m = e.byDate[date]
      if (!m) continue
      parcels += dailyParcelTotal(m)
      items += dailyItemTotal(m)
      waves += dailyWaveTotal(m)
    }
    return { date, parcels, items, waves }
  })
}

export interface DepartmentDailyRow {
  date: string
  byDepartment: Record<string, number>
}

/** Same day-by-day breakdown as computeWpDailyTrend, but split by department
 * (พัสดุรวม only, per department) — feeds the "ฝ่าย" view of the trend section. */
export function computeWpDailyTrendByDepartment(
  employees: WorkPerformanceEmployee[],
  dates: string[],
  departments: string[]
): DepartmentDailyRow[] {
  return dates.map((date) => {
    const byDepartment: Record<string, number> = {}
    for (const dept of departments) byDepartment[dept] = 0
    for (const e of employees) {
      const m = e.byDate[date]
      if (!m) continue
      byDepartment[e.department] = (byDepartment[e.department] ?? 0) + dailyParcelTotal(m)
    }
    return { date, byDepartment }
  })
}

const zeroMetrics: WorkPerformanceMetrics = {
  manageOrders: 0, printLabel: 0, printPickList: 0, pdaPick: 0, ship: 0, printInvoice: 0,
  pickWaveCount: 0, pickParcels: 0, pickSku: 0, scanPhotoOrders: 0, scanPhotoMessages: 0,
  sortWaveCount: 0, sortParcels: 0, sortSku: 0, packWaveCount: 0, packParcels: 0, packSku: 0,
  inspectWaveCount: 0, inspectParcels: 0, inspectSku: 0, pickSingleSkuSingleQty: 0,
  pickSingleSkuMultiQty: 0, pickMultiSku: 0, sortSingleSkuSingleQty: 0, sortSingleSkuMultiQty: 0,
  sortMultiSku: 0, packSingleSkuSingleQty: 0, packSingleSkuMultiQty: 0, packMultiSku: 0,
  transferDocs: 0, replenishDocs: 0,
}
