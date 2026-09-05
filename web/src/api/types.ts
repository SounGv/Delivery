/** Which crew a person belongs to. "online" = the parcel/item production line;
 * "offline" = the attendance/task-based crew (no parcel counts); "receiving" and
 * "warehouse" are the ฝ่ายรับเข้า / ฝ่ายคลัง crews recorded in the ▶ blocks. */
export type TeamId = "online" | "offline" | "receiving" | "warehouse"

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

/** One row from the standalone "ปัญหารอแก้" sheet — workplace obstacles/issues
 * reported by staff (unstable internet, printer/ink problems, PC crashes, etc.),
 * read-only. Dates are "" when the sheet left that cell blank (e.g. not started/fixed yet). */
export interface WorkIssue {
  date: string
  reporter: string
  category: string
  detail: string
  urgency: string
  assignee: string
  startDate: string
  dueDate: string
  resolution: string
  status: string
  verifyResult: string
  note: string
}

/** One day's record for a person in the รับเข้า/คลัง sheet. */
export interface RwDailyEntry {
  /** ค่าที่ 1 (SKU/บิล). */
  value1: number | null
  /** ค่าที่ 2 (จำนวนชิ้น). */
  value2: number | null
  checkIn?: string | null
  checkOut?: string | null
}

export interface RwStaff {
  name: string
  byDate: Record<string, RwDailyEntry>
  totalValue1: number
  totalValue2: number
}

/** A per-person KPI category (e.g. "จำนวนสินค้าที่รับเข้า"). */
export interface RwStaffCategory {
  id: string
  title: string
  target: string
  employees: RwStaff[]
}

/** A team-wide KPI metric with a free-text value per day. */
export interface RwMetric {
  id: string
  title: string
  target: string
  byDate: Record<string, string>
}

export interface RwDepartment {
  title: string
  /** Everyone in the department with attendance (check-in/out), merged across rows —
   * used by the unified Work & Attendance / OT pages. */
  staff?: RwStaff[]
  staffCategories: RwStaffCategory[]
  metrics: RwMetric[]
}

/** Data from the standalone "รับเข้า + คลัง" work sheet (ฝ่ายรับเข้า / ฝ่ายคลัง). */
export interface ReceivingWarehouse {
  dates: string[]
  departments: RwDepartment[]
}

/** Which sales-channel tab a BigSeller order-report row came from. */
export type OrderReportChannel = "online" | "offline"

/** One day's row from the standalone "รายงานคำสั่งซื้อ" sheets (BigSeller order-report
 * export) — one tab per sales channel, so the same date appears once per channel. */
export interface OrderReportDay {
  date: string
  channel: OrderReportChannel
  effSales: number
  effOrders: number
  totalOrders: number
  parcels: number
  totalRevenue: number
  sellerSubsidy: number
  productSales: number
  origPrice: number
  sales: number
  refundAmount: number
  refundOrders: number
  refundCustomers: number
  /** Percent, e.g. 0.47 means 0.47%. */
  refundRate: number
  cancelledAmount: number
  cancelledOrders: number
  aov: number
  discountCode: number
}

export interface OrderReport {
  days: OrderReportDay[]
}

/** One (date, shop) aggregate row from the offline manual-sales log ("รายงาน
 * คำสั่งซื้อ ออฟไลน์" — per-SKU-per-order entries grouped by day and shop). This is
 * the only source of cost data (for gross profit) in the whole sales-summary feature. */
export interface OfflineShopDay {
  date: string
  shop: string
  sales: number
  cost: number
  orderCount: number
  itemQty: number
  /** Sum of the sheet's "ยอดคืนเงิน" column (added 2026-09-04) — 0 for any
   * row logged before that date, since the column didn't exist yet. */
  refund: number
  /** Distinct orders (shop + order-time) with at least one refunded line. */
  refundOrderCount: number
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
  /** ฝ่ายรับเข้า / ฝ่ายคลัง work sheet. Optional/null until the parser that reads
   * that tab is redeployed. */
  receivingWarehouse?: ReceivingWarehouse | null
  /** BigSeller order-report export ("รายงานคำสั่งซื้อ"). Optional/null until the
   * parser that reads that tab is redeployed. */
  orderReport?: OrderReport | null
  /** Workplace obstacles/issues log ("ปัญหารอแก้"). Optional: absent until the
   * parser that reads that tab is redeployed. */
  workIssues?: WorkIssue[]
  /** Per-(date, shop) offline manual-sales aggregates — the source of the
   * "offline" channel in orderReport, plus the only place with cost/gross-profit
   * data and a per-shop breakdown. Optional: absent until the parser is redeployed. */
  offlineShopSales?: OfflineShopDay[]
}

export interface ApiErrorResponse {
  error: string
}
