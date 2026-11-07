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

/** One store's totals for one pulled period, from the "รายงานร้านค้า (BigSeller)"
 * sheet (a BigSeller Store Report export). Unlike OrderReportDay, this is NOT
 * daily — periodStart/periodEnd is whatever date range was exported (currently
 * pulled monthly), and every store's row for that pull shares the same period. */
export interface StoreReportRow {
  /** Literal text from the sheet, e.g. "01 ก.ย. 2026" — not a parsed date. */
  periodStart: string
  periodEnd: string
  store: string
  effSales: number
  effOrders: number
  totalRevenue: number
  sellerSubsidy: number
  origPrice: number
  sales: number
  productSales: number
  totalOrders: number
  parcels: number
  customers: number
  refundAmount: number
  refundOrders: number
  refundCustomers: number
  avgPerCustomer: number
  cancelledOrders: number
  cancelledAmount: number
}

export interface StoreReport {
  rows: StoreReportRow[]
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
  /** Per-store BigSeller Store Report export ("รายงานร้านค้า (BigSeller)"),
   * pulled at whatever cadence (currently monthly). Optional/null until the
   * parser that reads that tab is redeployed, or before any period is pulled. */
  storeReport?: StoreReport | null
  /** Workplace obstacles/issues log ("ปัญหารอแก้"). Optional: absent until the
   * parser that reads that tab is redeployed. */
  workIssues?: WorkIssue[]
  /** Per-(date, shop) offline manual-sales aggregates — the source of the
   * "offline" channel in orderReport, plus the only place with cost/gross-profit
   * data and a per-shop breakdown. Optional: absent until the parser is redeployed. */
  offlineShopSales?: OfflineShopDay[]
}

/** Backend payload slices, one per `?path=` (see PAYLOAD_PARTS_ in apps-script/Code.js).
 * "core" is the DashboardResponse above; the other three are heavy and are fetched
 * only by the page that shows them. Each carries the calendar `todayDate`. */
export type PayloadPartPath = "core" | "workPerformance" | "cancelled" | "focus" | "restock"

interface PayloadPartMeta {
  generatedAt: string
  todayDate: string
}

/** BigSeller work-performance import (see WorkPerformance's doc). `null` until
 * both the raw export tab and its name/department mapping tab exist. */
export interface WorkPerformancePart extends PayloadPartMeta {
  workPerformance: WorkPerformance | null
}

/** Cancelled-order scan log from the gv-returns-sync workbook (two tabs: stock
 * deducted / not deducted). */
export interface CancelledPart extends PayloadPartMeta {
  cancelledOrders: CancelledOrdersReport
}

/** One of the six backlog queues, as summarised at the top of the sheet's
 * "โฟกัสทีม-งานค้าง" tab (the page the team opens every day). */
export interface BacklogQueueSummary {
  /** Full queue name, e.g. "1 รอ Stock-In". */
  queue: string
  queueNo: number
  orders: number
  lines: number
  oldestDays: number | null
  /** Department that owns the queue ("ฝ่ายรับคืน", "ฝ่ายคลังเก็บ", …). */
  owner: string
  valueBaht: number | null
  /** The team's own one-line meaning of the queue, from the sheet's "วิธีใช้" tab; "" if unavailable. */
  meaning?: string
}

/** A due-date alert count from the sheet ("เลยกำหนดแล้ว", "ครบกำหนดวันนี้", …).
 * `nested` is a sub-count the sheet indents under the line above it. */
export interface BacklogAlert {
  label: string
  count: number
  nested: boolean
}

/** One package line still waiting on someone. The sheet drops the row by itself
 * once the case is handled. */
export interface BacklogRow {
  /** Days since the case started; null when the source has no start date (cn-restock rows). */
  ageDays: number | null
  queue: string
  queueNo: number
  channel: string
  packageNo: string
  orderNo: string
  tracking: string
  sku: string
  qty: number
  /** yyyy-MM-dd, "" when unknown. */
  startedOn: string
  source: string
  statusBeforeCancel: string
  cancelReason: string
  stockInStatus: string
  owner: string
  returnStatus: string
  /** yyyy-MM-dd, "" when the case has no deadline. */
  dueDate: string
  valueBaht: number | null
  /** Sheet's own text, e.g. "เลย 88 วัน"; "-" when there is no deadline. */
  timeLeft: string
  /** Sheet's own alert text, e.g. "เลยกำหนด ตามด่วน"; "" when none. */
  alert: string
}

export interface BacklogReport {
  queues: BacklogQueueSummary[]
  totalValue: number | null
  alerts: BacklogAlert[]
  rows: BacklogRow[]
  /** Set (and the rest empty) when the tab cannot be found. */
  missingTab: string
  error: string
}

export interface FocusPart extends PayloadPartMeta {
  focus: BacklogReport
}

/** One SKU line of the gv-returns-sync workbook's "cn-restock" tab: a return/bounce that
 * is not fully stocked in yet. Headers and wording are the sheet's own. */
export interface RestockRow {
  platform: string
  store: string
  packageNo: string
  orderNo: string
  productName: string
  sku: string
  qty: number
  refundAmount: number
  /** "สถานะคำสั่งซื้อ", e.g. "ยกเลิกแล้ว" / "เสร็จเรียบร้อย" / "รอคืนสินค้า". */
  orderStatus: string
  /** "สถานะหลังการขาย", e.g. "ปิดคำขอ" / "ยอมรับการคืนสินค้า"; "" when none. */
  afterSalesStatus: string
  /** "ยังไม่ Stock-In" / "Stock-In บางส่วน" / "ไม่ Stock-In". */
  stockInStatus: string
  stockInQty: number
  returnTracking: string
  /** "yyyy-MM-dd HH:mm", "" when unknown. */
  requestedAt: string
  arrivedAt: string
  stockInNote: string
  receiptStatus: string
  /** "ที่มา" column of the sheet. */
  origin: string
  owner: string
  returnStatus: string
}

export interface RestockReport {
  rows: RestockRow[]
  /** Set (and `rows` empty) when the tab cannot be found. */
  missingTab: string
  error: string
}

export interface RestockPart extends PayloadPartMeta {
  restock: RestockReport
}

/** Metric keys straight from BigSeller's "รายงานผลการทำงาน" (work-performance)
 * export column names — see WORK_PERFORMANCE_COLUMNS_ in apps-script/SheetParser.js
 * for the exact header-to-key mapping. */
export interface WorkPerformanceMetrics {
  manageOrders: number
  printLabel: number
  printPickList: number
  pdaPick: number
  ship: number
  printInvoice: number
  pickWaveCount: number
  pickParcels: number
  pickSku: number
  scanPhotoOrders: number
  scanPhotoMessages: number
  sortWaveCount: number
  sortParcels: number
  sortSku: number
  packWaveCount: number
  packParcels: number
  packSku: number
  inspectWaveCount: number
  inspectParcels: number
  inspectSku: number
  pickSingleSkuSingleQty: number
  pickSingleSkuMultiQty: number
  pickMultiSku: number
  sortSingleSkuSingleQty: number
  sortSingleSkuMultiQty: number
  sortMultiSku: number
  packSingleSkuSingleQty: number
  packSingleSkuMultiQty: number
  packMultiSku: number
  /** Distinct เลขที่ใบย้ายสินค้า that day from the "บันทึกการอัปเดตตำแหน่งสต็อก
   * (BigSeller)" stock-move-log tab (APP ย้ายและนำเข้า/ออกชั้นวาง) — ฝ่ายคลัง's
   * real move work, since the columns above (BigSeller's pick/pack/ship
   * report) stay near-zero for warehouse staff. See parseStockMoveSheet_'s
   * doc. A non-คลัง employee can still show a real (non-zero) pick/pack
   * column above on a day they helped ฝ่ายคลัง, and vice versa. */
  transferDocs: number
  /** Distinct เลขใบเติมสต็อก that day (APP เติมสต็อกและนำเข้า/ออกชั้นวาง) —
   * kept separate from transferDocs, not summed, per explicit request. */
  replenishDocs: number
}

/** One BigSeller operator, joined against the "รายชื่อพนักงาน (BigSeller)"
 * name/department mapping tab. */
export interface WorkPerformanceEmployee {
  /** BigSeller username, e.g. "st_ooh@UJR3123225". */
  operator: string
  name: string
  /** ออนไลน์ / ออฟไลน์ / คลัง / แอดมิน — exactly as entered in the mapping tab. */
  department: string
  byDate: Record<string, WorkPerformanceMetrics>
  totals: WorkPerformanceMetrics
}

/**
 * New, standalone BigSeller work-performance import — pulled on-demand from
 * BigSeller's own "รายงานผลการทำงาน" report (not the legacy manually-typed
 * employee sheets). Deliberately kept separate from `employees`/`teamTotalsByDate`
 * per explicit instruction, so the two can be compared before anyone decides to
 * retire the old manual entry. Optional/null until both BigSeller tabs exist.
 */
export interface WorkPerformance {
  dates: string[]
  employees: WorkPerformanceEmployee[]
  /** BigSeller usernames found in the raw export but missing from the mapping
   * tab — surfaced instead of silently dropped, so a new account gets noticed. */
  unmapped: string[]
}

export type CancelledStatus = "รอตรวจสอบ" | "รับแล้ว" | "ไม่ตรง" | "ปิดงาน"

/** One cancelled-order line (one SKU of one order) from the gv-returns-sync
 * workbook — see parseCancelledSheet_ in apps-script/SheetParser.js. `date` is
 * yyyy-MM-dd; `printedAt` is "yyyy-MM-dd HH:mm" text (blank when unknown). */
export interface CancelledRow {
  /** true = the order was cancelled after stock was deducted (parcel must come back to the shelf). */
  stockDeducted: boolean
  date: string
  channel: string
  bsParcel: string
  orderNo: string
  tracking: string
  sku: string
  qty: number
  /** BigSeller user who printed the label, without the "@account" suffix. */
  printer: string
  printedAt: string
  status: CancelledStatus
  /** For "ปิดงาน": why the warehouse closed the line — the sheet's bracketed text,
   * "Stock-In แล้ว" or "ได้เงินคืนแล้ว". Absent/empty for every other status. */
  closedReason?: string
  /** What the warehouse scanned/typed for this line; blank = not scanned yet. */
  scanned: string
  /** Who received the parcel back (ชื่อคนเก็บ); blank until scanned. */
  picker: string
}

export interface CancelledOrdersReport {
  rows: CancelledRow[]
  /** Repeated (parcel + order + SKU) lines that were collapsed into one. */
  duplicatesDropped: number
  /** Source tabs that could not be found. */
  missingTabs: string[]
  /** Non-empty when the source workbook could not be read at all. */
  error: string
}

export interface ApiErrorResponse {
  error: string
}
