import { daysBetween } from "@/lib/cancelled-selectors"
import type { RwDepartment, RwMetric, RwStaffCategory } from "@/api/types"

/** Helpers over the hand-filled "รับเข้า+คลัง" sheet block, shared by the two department
 * pages and the overview so all of them count the same way. */

export const hasValue = (v: { value1: number | null; value2: number | null; checkIn?: string | null; checkOut?: string | null } | undefined) =>
  !!v && (v.value1 != null || v.value2 != null || !!v.checkIn || !!v.checkOut)

/** Dates (across all staff + metrics) that actually carry a value, newest first. */
export function datesWithData(dep: RwDepartment[]): string[] {
  const set = new Set<string>()
  for (const d of dep) {
    for (const cat of d.staffCategories) {
      for (const e of cat.employees) {
        for (const [date, v] of Object.entries(e.byDate)) if (hasValue(v)) set.add(date)
      }
    }
    for (const m of d.metrics) {
      for (const [date, text] of Object.entries(m.byDate)) if (text?.trim()) set.add(date)
    }
  }
  return [...set].sort().reverse()
}

/** The sheet's attendance block ("ขาด ลา มาสาย") has no number or title of its own. */
export const isAttendanceCategory = (cat: RwStaffCategory) => !cat.title.trim() && /ขาด|ลา|สาย/.test(cat.target)

export function latestDateOf(cat: RwStaffCategory): string {
  let latest = ""
  for (const e of cat.employees) {
    for (const [date, v] of Object.entries(e.byDate)) if (hasValue(v) && date > latest) latest = date
  }
  return latest
}

export function latestMetricDate(m: RwMetric): string {
  let latest = ""
  for (const [date, text] of Object.entries(m.byDate)) if (text?.trim() && date > latest) latest = date
  return latest
}

/** A block counts as "still filled in" when its newest value is at most this many days old. */
export const FRESH_WITHIN_DAYS = 14

export interface RwDepartmentSummary {
  title: string
  /** Newest date that carries any value for this department; "" when the sheet is empty. */
  latestDate: string
  /** Staff on the attendance block. */
  staffCount: number
  /** Staff with a check-in time on `latestDate`. */
  checkedIn: number
  kpiCategories: number
  freshKpiCategories: number
  metrics: number
  freshMetrics: number
}

export function summarizeRwDepartment(dep: RwDepartment, todayIso: string): RwDepartmentSummary {
  const kpiCategories = dep.staffCategories.filter((c) => !isAttendanceCategory(c))
  const attendance = dep.staffCategories.find(isAttendanceCategory)
  const latestDate = datesWithData([dep])[0] ?? ""
  const isFresh = (latest: string) => !!latest && daysBetween(latest, todayIso) <= FRESH_WITHIN_DAYS
  return {
    title: dep.title,
    latestDate,
    staffCount: attendance?.employees.length ?? 0,
    checkedIn: attendance && latestDate ? attendance.employees.filter((e) => !!e.byDate[latestDate]?.checkIn).length : 0,
    kpiCategories: kpiCategories.length,
    freshKpiCategories: kpiCategories.filter((c) => isFresh(latestDateOf(c))).length,
    metrics: dep.metrics.length,
    freshMetrics: dep.metrics.filter((m) => isFresh(latestMetricDate(m))).length,
  }
}
