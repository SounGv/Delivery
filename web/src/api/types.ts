/** Which crew a person belongs to. "online" = the parcel/item production line;
 * "offline" = the attendance/task-based crew (no parcel counts). */
export type TeamId = "online" | "offline"

export interface EmployeeDailyEntry {
  parcels: number | null
  items: number | null
  /** "HH:mm" clock-in time, present only for date-blocks that record it (newer days). */
  checkIn?: string | null
  /** "HH:mm" clock-out time, present only for date-blocks that record it (newer days). */
  checkOut?: string | null
  /** Free-text task the offline crew did that day ("งานที่ทำ"), when the sheet records it. */
  work?: string | null
  /** Free-text note ("หมายเหตุ"), when the sheet records it. */
  note?: string | null
}

export interface Employee {
  name: string
  /** Crew this roster entry belongs to. Optional for back-compat with payloads
   * from before the parser split the two teams — treat missing as "online". */
  team?: TeamId
  byDate: Record<string, EmployeeDailyEntry>
  totalParcels: number
  totalItems: number
}

export interface TeamDailyTotal {
  parcels: number
  items: number
  activeEmployees: number
}

export interface CategoryRow {
  label: string
  note?: string
  byDate: Record<string, string>
}

export interface Category {
  id: string
  title: string
  rows: CategoryRow[]
}

export interface ShopSlaCriterion {
  label: string
  byDate: Record<string, number>
}

export interface ShopSla {
  shop: string
  criteria: ShopSlaCriterion[]
}

export interface DashboardTarget {
  label: string
  value: number | null
}

/** One row from the standalone post-shipment error sheet ("ข้อผิดพลาด"/"ออเดอร์ส่งผิด"), read-only. */
export interface ShipError {
  date: string
  name: string
  po: string
  wrongSku: string
  wrongQty: number | null
  rightSku: string
  rightQty: number | null
  note: string
}

export interface DashboardResponse {
  generatedAt: string
  todayDate: string
  dates: string[]
  employees: Employee[]
  teamTotalsByDate: Record<string, TeamDailyTotal>
  monthlyTotals: { parcels: number; items: number }
  /** Online production target (kept for back-compat; same as targetsByTeam.online). */
  target: DashboardTarget | null
  /** Per-team production targets. Optional: absent on payloads from before the
   * parser split teams. The offline crew usually has no numeric target. */
  targetsByTeam?: Partial<Record<TeamId, DashboardTarget>>
  categories: Category[]
  shopSla: ShopSla[]
  /** Detailed post-shipment errors from the standalone error sheet. Optional:
   * absent until the Apps Script parser that reads that sheet is redeployed. */
  shipErrors?: ShipError[]
}

export interface ApiErrorResponse {
  error: string
}
