import type { BacklogRow, CancelledRow, Category, RestockRow } from "@/api/types"
import { daysBetween } from "@/lib/cancelled-selectors"
import type { RankedEmployeeMetric } from "@/lib/workforce"

/** A report ready to be saved as CSV: file name + header row + body rows. */
export interface ExportTable {
  filename: string
  headers: string[]
  rows: (string | number)[][]
}

const today = () => new Date().toISOString().slice(0, 10)

/** Every cancelled-order line in `rows` (the caller passes the FILTERED set). */
export function cancelledReport(rows: CancelledRow[], kindLabel: string, todayIso: string): ExportTable {
  return {
    filename: `cancelled_${kindLabel}_${today()}.csv`,
    headers: [
      "วันที่", "ช่องทาง", "หมายเลขคำสั่งซื้อ", "SKU", "จำนวน", "หมายเลขแทร็คกิ้ง", "หมายเลขพัสดุ (BigSeller)", "ผู้พิมพ์ใบปะหน้า", "เวลาที่พิมพ์",
      "ตัดสต็อก", "สถานะ", "ค้างมาแล้ว (วัน)", "สแกน/กรอกหมายเลข", "ชื่อคนเก็บ",
    ],
    rows: rows.map((r) => [
      r.date, r.channel, r.orderNo, r.sku, r.qty, r.tracking, r.bsParcel, r.printer, r.printedAt,
      r.stockDeducted ? "ตัดสต็อกแล้ว" : "ยังไม่ตัดสต็อก", r.status, r.status === "รอตรวจสอบ" ? daysBetween(r.date, todayIso) : "", r.scanned, r.picker,
    ]),
  }
}

/** Every cn-restock line in `rows` (the caller passes the FILTERED set), headed like the sheet. */
export function restockReport(rows: RestockRow[]): ExportTable {
  return {
    filename: `cn-restock_${today()}.csv`,
    headers: [
      "แพลตฟอร์ม", "ร้านค้า BigSeller", "หมายเลขพัสดุ", "หมายเลขคำสั่งซื้อ", "ชื่อสินค้า", "SKU Merchant", "จำนวน", "ยอดคืนเงิน",
      "สถานะคำสั่งซื้อ", "สถานะหลังการขาย", "สถานะ Stock-In", "จำนวน Stock-In", "หมายเลขแทร็คกิ้งคืนสินค้า", "เวลายื่นบริการหลังการขาย",
      "เวลาถึงคลัง", "หมายเหตุ Stock-In", "สถานะการรับ", "ที่มา", "ฝ่ายที่ดูแล", "สถานะคืนสินค้า",
    ],
    rows: rows.map((r) => [
      r.platform, r.store, r.packageNo, r.orderNo, r.productName, r.sku, r.qty, r.refundAmount,
      r.orderStatus, r.afterSalesStatus, r.stockInStatus, r.stockInQty, r.returnTracking, r.requestedAt,
      r.arrivedAt, r.stockInNote, r.receiptStatus, r.origin, r.owner, r.returnStatus,
    ]),
  }
}

/** Every backlog line in `rows` (the caller passes the FILTERED set). */
export function backlogReport(rows: BacklogRow[]): ExportTable {
  return {
    filename: `backlog_${today()}.csv`,
    headers: [
      "ค้างมาแล้ว (วัน)", "คิว", "ช่องทาง", "package", "เลขออเดอร์", "แทร็คกิ้ง", "SKU", "ชิ้น", "วันที่เริ่มเรื่อง", "รายงานต้นทาง",
      "สถานะก่อนยกเลิก", "เหตุผลยกเลิก", "สถานะ Stock-In", "ฝ่ายที่ดูแล", "สถานะคืนสินค้า", "กำหนดดำเนินการ", "มูลค่า (฿)", "เหลือเวลา", "เตือน",
    ],
    rows: rows.map((r) => [
      r.ageDays ?? "", r.queue, r.channel, r.packageNo, r.orderNo, r.tracking, r.sku, r.qty, r.startedOn, r.source,
      r.statusBeforeCancel, r.cancelReason, r.stockInStatus, r.owner, r.returnStatus, r.dueDate, r.valueBaht ?? "", r.timeLeft, r.alert,
    ]),
  }
}

/** Individual ranking for one department and date range, in rank order. */
export function rankingReport(ranking: RankedEmployeeMetric[], department: string, start: string, end: string): ExportTable {
  return {
    filename: `ranking_${department}_${start}_${end}.csv`,
    headers: ["อันดับ", "ชื่อ", "พัสดุ", "สินค้า", "วันที่ทำงาน", "พัสดุ/วัน", "% Target", "PDA หยิบของ", "พิมพ์ใบปะหน้า", "Wave ที่หยิบ", "SKU ที่หยิบ"],
    rows: ranking.map((m) => [
      m.rank, m.name, m.parcels, m.items, m.activeDays, Math.round(m.productivity), m.pctTarget === null ? "" : Math.round(m.pctTarget),
      m.pdaPick ?? "", m.printLabel ?? "", m.pickWaveCount ?? "", m.pickSku ?? "",
    ]),
  }
}

/** One KPI category laid out like the sheet: a row per item, a column per date. */
export function categoryReport(category: Category, dates: string[]): ExportTable {
  return {
    filename: `category_${category.title}_${dates[0] ?? ""}_${dates[dates.length - 1] ?? ""}.csv`,
    headers: ["รายการ", "หมายเหตุ", ...dates],
    rows: category.rows.map((row) => [row.label, row.note ?? "", ...dates.map((d) => row.byDate[d] ?? "")]),
  }
}

/** Every KPI category in one file, long format (one line per category × item × date that
 * actually has a value) so it filters and pivots cleanly in Excel. */
export function allCategoriesReport(categories: Category[], dates: string[]): ExportTable {
  const rows: (string | number)[][] = []
  for (const category of categories) {
    for (const row of category.rows) {
      for (const d of dates) {
        const value = row.byDate[d]
        if (value !== undefined && value !== "") rows.push([category.title, row.label, d, value])
      }
    }
  }
  return {
    filename: `categories_all_${dates[0] ?? ""}_${dates[dates.length - 1] ?? ""}.csv`,
    headers: ["หมวดหมู่", "รายการ", "วันที่", "ค่า"],
    rows,
  }
}
