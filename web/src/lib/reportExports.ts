import type { Category, ReturnRow } from "@/api/types"
import type { RankedEmployeeMetric } from "@/lib/workforce"

/** A report ready to be saved as CSV: file name + header row + body rows. */
export interface ExportTable {
  filename: string
  headers: string[]
  rows: (string | number)[][]
}

const today = () => new Date().toISOString().slice(0, 10)

/** Every return case in `rows` (the caller passes the FILTERED set, not just the visible page). */
export function returnsReport(rows: ReturnRow[], scopeLabel: string): ExportTable {
  return {
    filename: `returns_${scopeLabel}_${today()}.csv`,
    headers: [
      "ร้าน", "แพลตฟอร์ม", "เลขคำสั่งซื้อ", "เลขพัสดุ BigSeller", "SKU", "จำนวนต้องคืน", "Stock-In แล้ว", "ยอดคืนเงิน",
      "ประเภทหลังการขาย", "สถานะการคืนสินค้า", "สถานะ Stock-In", "สถานะคำสั่งซื้อ", "ขนส่งขากลับ (สถานะ)", "ขนส่งขากลับ (ชื่อขนส่ง)", "ธง",
      "ปุ่มคืนเงินในแพลตฟอร์ม", "สถานะ (พนักงาน)", "เวลาสั่งซื้อ", "เวลาขอคืน", "เวลาครบกำหนดดำเนินการ",
      "ครบกำหนดใกล้สุด", "เหลือเวลา (วัน)", "สาเหตุ", "เหตุผลที่ขอคืนสินค้า",
    ],
    rows: rows.map((r) => [
      r.store, r.platform, r.orderNo, r.parcelNo, r.sku, r.qtyToReturn, r.qtyStockedIn, r.refundAmount,
      r.afterSalesType, r.returnStatus, r.stockInStatus, r.orderStatus, r.returnShipping, r.returnCarrier, r.flag,
      r.refundButtonPending, r.staffStatus, r.orderTime, r.requestTime, r.dueTime,
      r.nearestDue, r.daysUntilDue ?? "", r.reason, r.shopeeReasonText,
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
