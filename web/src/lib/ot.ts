import type { DashboardResponse, Employee, EmployeeDailyEntry } from "@/api/types"

/**
 * Central OT / worked-hours calculation layer — the ONLY place OT and worked
 * time are derived, so every page reads identical numbers. All inputs come from
 * the real Google Sheets data (parcels/items + optional check-in/check-out per
 * employee per day); nothing is mocked. Per the requirement, OT tracks only
 * TIME and WORK DONE — no money/pay. The normal work window, lunch break and
 * department label are configuration (not sheet transaction data), from Settings.
 */

export interface OtConfig {
  /** Normal shift start hour (24h). Early arrival before this is NOT counted as OT. */
  workStartHour: number
  /** Normal shift end hour (24h). Work past this on a work day becomes OT. */
  workEndHour: number
  /** Lunch break start hour (24h) — deducted from worked hours. */
  lunchStartHour: number
  /** Lunch break end hour (24h). */
  lunchEndHour: number
  /** Department label shown on the OT form (sheet has no per-person department). */
  department: string
  /** Daily parcel target at full normal hours (for dynamic/pro-rated target). */
  dailyTarget: number
  /** Only read time data from this ISO date onward (earlier dates have none). */
  attendanceStartDate: string
}

export const DEFAULT_OT_CONFIG: OtConfig = {
  workStartHour: 9,
  workEndHour: 18,
  lunchStartHour: 12,
  lunchEndHour: 13,
  department: "คลังสินค้า",
  dailyTarget: 350,
  // Check-in/out columns began in the July sheet on 2026-07-01. Earlier dates
  // have no time columns at all, so nothing before this is dropped by mistake.
  attendanceStartDate: "2026-07-01",
}

/** Normal net working hours per day = span − lunch (e.g. 09–18 minus 1h = 8h). */
export function normalWorkingHours(config: OtConfig): number {
  const span = config.workEndHour - config.workStartHour
  const lunch = Math.max(0, Math.min(config.workEndHour, config.lunchEndHour) - Math.max(config.workStartHour, config.lunchStartHour))
  return Math.max(0, span - lunch)
}

/** Target pro-rated to hours actually worked: (dailyTarget / normalHours) × workedHours.
 * Someone who works 6h has a proportionally lower target than the full-day 8h target. */
export function dynamicTarget(workedHours: number, config: OtConfig): number {
  const normal = normalWorkingHours(config)
  if (normal <= 0) return config.dailyTarget
  return Math.round((config.dailyTarget / normal) * workedHours)
}

export type WorkStatus = "WORK" | "DAY_OFF" | "HOLIDAY" | "LEAVE"
export type OtType = "OT_AFTER_WORK" | "WORKED_ON_DAY_OFF" | "OT_ON_DAY_OFF" | "NONE"
export type OtApprovalStatus = "PENDING" | "APPROVED" | "REJECTED"

export const OT_TYPE_LABEL: Record<OtType, string> = {
  OT_AFTER_WORK: "OT หลังเลิกงาน",
  WORKED_ON_DAY_OFF: "ทำงานวันหยุด",
  OT_ON_DAY_OFF: "OT วันหยุด",
  NONE: "-",
}

export const OT_STATUS_LABEL: Record<OtApprovalStatus, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
}

/** Arrival punctuality vs the normal start hour. */
export type ArrivalStatus = "EARLY" | "ON_TIME" | "LATE" | "UNKNOWN"

export const ARRIVAL_STATUS_LABEL: Record<ArrivalStatus, string> = {
  EARLY: "เข้าก่อน (ส่งด่วน)",
  ON_TIME: "ตรงเวลา",
  LATE: "สาย",
  UNKNOWN: "-",
}

/** Classifies a check-in time against the normal start hour — the same rule the
 * Work & Attendance badges use (early = before start, late = after start). */
export function arrivalStatus(checkIn: string | null | undefined, config: OtConfig): ArrivalStatus {
  const inMin = timeToMinutes(checkIn)
  if (inMin === null) return "UNKNOWN"
  const start = config.workStartHour * 60
  if (inMin < start) return "EARLY"
  if (inMin > start) return "LATE"
  return "ON_TIME"
}

/** "HH:mm" -> minutes since midnight, or null if unparseable/blank. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null
  const m = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Minutes of overlap between [start,end] and [lunchStart,lunchEnd]. */
function lunchOverlapMinutes(startMin: number, endMin: number, config: OtConfig): number {
  const ls = config.lunchStartHour * 60
  const le = config.lunchEndHour * 60
  const overlap = Math.min(endMin, le) - Math.max(startMin, ls)
  return overlap > 0 ? overlap : 0
}

/** Net worked hours from check-in to check-out, minus any lunch-break overlap.
 * Null when either time is missing (can't compute a worked span). */
export function calculateWorkedHours(entry: EmployeeDailyEntry, config: OtConfig): number | null {
  const inMin = timeToMinutes(entry.checkIn)
  const outMin = timeToMinutes(entry.checkOut)
  if (inMin === null || outMin === null || outMin <= inMin) return null
  const net = outMin - inMin - lunchOverlapMinutes(inMin, outMin, config)
  return Math.round((net / 60) * 100) / 100
}

function hasActivity(entry: EmployeeDailyEntry | undefined): boolean {
  return !!entry && ((entry.parcels ?? 0) > 0 || (entry.items ?? 0) > 0 || !!entry.checkIn || !!entry.checkOut)
}

/**
 * Derived work status. The sheet has no explicit WORK/DAY_OFF/HOLIDAY/LEAVE
 * marker, so this infers WORK from recorded activity/clock-in and returns null
 * when there is no record at all (so no-shows are never counted). When a
 * schedule source is added, only this function changes.
 */
export function calculateWorkStatus(entry: EmployeeDailyEntry | undefined): WorkStatus | null {
  if (!entry) return null
  if (hasActivity(entry)) return "WORK"
  return null
}

/** OT hours (2-decimal), from check-out past the normal window. Early arrival is not OT. */
export function calculateOtHours(entry: EmployeeDailyEntry, config: OtConfig): number {
  const out = timeToMinutes(entry.checkOut)
  if (out === null) return 0
  const workEnd = config.workEndHour * 60
  const overtime = out - workEnd
  if (overtime <= 0) return 0
  return Math.round((overtime / 60) * 100) / 100
}

export function calculateOtType(status: WorkStatus | null, otHours: number): OtType {
  if (status === "WORK") return otHours > 0 ? "OT_AFTER_WORK" : "NONE"
  if (status === "DAY_OFF" || status === "HOLIDAY") return otHours > 0 ? "OT_ON_DAY_OFF" : "WORKED_ON_DAY_OFF"
  return "NONE"
}

export interface OtRecord {
  date: string
  employeeName: string
  department: string
  workStatus: WorkStatus
  checkIn: string | null
  checkOut: string | null
  otType: OtType
  otHours: number
  status: OtApprovalStatus
  parcels: number | null
  items: number | null
}

/**
 * All OT records across the dataset (optionally within [start, end]). One record
 * per employee-day that has OT hours. Approval status defaults to PENDING because
 * the sheet has no approval workflow — the truthful state, not a fabricated value.
 */
export function collectOtRecords(
  employees: Employee[],
  config: OtConfig,
  range?: { start: string; end: string }
): OtRecord[] {
  const records: OtRecord[] = []
  for (const e of employees) {
    for (const [date, entry] of Object.entries(e.byDate)) {
      if (range && (date < range.start || date > range.end)) continue
      // Hard cutoff: never derive time-based values before the attendance start date.
      if (date < config.attendanceStartDate) continue
      const status = calculateWorkStatus(entry)
      if (!status) continue
      const otHours = calculateOtHours(entry, config)
      if (otHours <= 0) continue
      records.push({
        date,
        employeeName: e.name,
        department: config.department,
        workStatus: status,
        checkIn: entry.checkIn ?? null,
        checkOut: entry.checkOut ?? null,
        otType: calculateOtType(status, otHours),
        otHours,
        status: "PENDING",
        parcels: entry.parcels,
        items: entry.items,
      })
    }
  }
  return records.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName))
}

export interface OtSummary {
  totalHours: number
  employeeCount: number
  dayCount: number
  recordCount: number
  pendingCount: number
  /** Total parcels/items produced on OT days (the "work done" side of OT). */
  totalParcels: number
  totalItems: number
}

export function getOtSummary(records: OtRecord[]): OtSummary {
  const employees = new Set<string>()
  const days = new Set<string>()
  let totalHours = 0
  let pending = 0
  let totalParcels = 0
  let totalItems = 0
  for (const r of records) {
    employees.add(r.employeeName)
    days.add(r.date)
    totalHours += r.otHours
    if (r.status === "PENDING") pending += 1
    totalParcels += r.parcels ?? 0
    totalItems += r.items ?? 0
  }
  return {
    totalHours: Math.round(totalHours * 100) / 100,
    employeeCount: employees.size,
    dayCount: days.size,
    recordCount: records.length,
    pendingCount: pending,
    totalParcels,
    totalItems,
  }
}

/** True if ANY employee-day carries a check-in/out time — used to show a
 * "connect the time columns / redeploy" hint instead of empty OT pages. */
export function datasetHasTimeData(employees: Employee[]): boolean {
  return employees.some((e) => Object.values(e.byDate).some((d) => d.checkIn || d.checkOut))
}

export function summaryForDate(response: DashboardResponse, date: string, config: OtConfig): OtSummary {
  return getOtSummary(collectOtRecords(response.employees, config, { start: date, end: date }))
}

export function summaryForMonth(response: DashboardResponse, monthKey: string, config: OtConfig): OtSummary {
  return getOtSummary(collectOtRecords(response.employees, config, { start: `${monthKey}-01`, end: `${monthKey}-31` }))
}

export interface WorkedHoursRecord {
  date: string
  employeeName: string
  checkIn: string | null
  checkOut: string | null
  workedHours: number
  earlyStart: boolean
  parcels: number
  items: number
  parcelsPerHour: number
  itemsPerHour: number
  /** Target pro-rated to this person's actual worked hours. */
  dynamicTarget: number
  /** parcels ÷ dynamicTarget × 100. */
  achievementPct: number
}

/**
 * Per employee-day worked-hours + productivity, for days that recorded BOTH
 * check-in and check-out. Worked hours are net of the lunch break; an early
 * start (before the normal start hour, e.g. 08:30 express) is flagged and IS
 * counted as worked time, but is never treated as OT.
 */
export function collectWorkedHours(
  employees: Employee[],
  config: OtConfig,
  range?: { start: string; end: string }
): WorkedHoursRecord[] {
  const out: WorkedHoursRecord[] = []
  const startMin = config.workStartHour * 60
  for (const e of employees) {
    for (const [date, entry] of Object.entries(e.byDate)) {
      if (range && (date < range.start || date > range.end)) continue
      // Hard cutoff: never compute worked hours before the attendance start date.
      if (date < config.attendanceStartDate) continue
      const worked = calculateWorkedHours(entry, config)
      if (worked === null || worked <= 0) continue
      const inMin = timeToMinutes(entry.checkIn)
      const parcels = entry.parcels ?? 0
      const items = entry.items ?? 0
      const target = dynamicTarget(worked, config)
      out.push({
        date,
        employeeName: e.name,
        checkIn: entry.checkIn ?? null,
        checkOut: entry.checkOut ?? null,
        workedHours: worked,
        earlyStart: inMin !== null && inMin < startMin,
        parcels,
        items,
        parcelsPerHour: worked > 0 ? Math.round((parcels / worked) * 10) / 10 : 0,
        itemsPerHour: worked > 0 ? Math.round((items / worked) * 10) / 10 : 0,
        dynamicTarget: target,
        achievementPct: target > 0 ? Math.round((parcels / target) * 1000) / 10 : 0,
      })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName))
}

export interface WorkedHoursSummary {
  recordCount: number
  employeeCount: number
  dayCount: number
  totalWorkedHours: number
  avgParcelsPerPersonPerDay: number
  avgItemsPerPersonPerDay: number
  avgParcelsPerHour: number
  avgItemsPerHour: number
}

export function getWorkedHoursSummary(records: WorkedHoursRecord[]): WorkedHoursSummary {
  const employees = new Set<string>()
  const days = new Set<string>()
  let totalWorked = 0
  let totalParcels = 0
  let totalItems = 0
  for (const r of records) {
    employees.add(r.employeeName)
    days.add(r.date)
    totalWorked += r.workedHours
    totalParcels += r.parcels
    totalItems += r.items
  }
  const n = records.length || 1
  return {
    recordCount: records.length,
    employeeCount: employees.size,
    dayCount: days.size,
    totalWorkedHours: Math.round(totalWorked * 100) / 100,
    // Per person-day = per record (each record is one employee on one day).
    avgParcelsPerPersonPerDay: Math.round(totalParcels / n),
    avgItemsPerPersonPerDay: Math.round(totalItems / n),
    avgParcelsPerHour: totalWorked > 0 ? Math.round((totalParcels / totalWorked) * 10) / 10 : 0,
    avgItemsPerHour: totalWorked > 0 ? Math.round((totalItems / totalWorked) * 10) / 10 : 0,
  }
}
