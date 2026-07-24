export interface SummaryItem {
  label: string
  value: string | number
}

export interface ReportExcelData {
  filename: string
  period: string
  employeeFilter: string
  summary: SummaryItem[]
  staffing: { message: string; ok: boolean }
  tableTitle: string
  tableHeaders: string[]
  tableRows: (string | number)[][]
}

const BRAND_BLUE = "FF2563EB"
const SLATE = "FF334155"
const GREEN_BG = "FFD1FAE5"
const GREEN_TEXT = "FF065F46"
const RED_BG = "FFFEE2E2"
const RED_TEXT = "FF991B1B"

/** Builds a nicely-formatted (bold headers, colored sections, frozen header row) .xlsx workbook
 * instead of a flat CSV — plain CSVs render as an unstyled wall of rows once opened in Excel. */
export async function downloadReportExcel(data: ReportExcelData) {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Warehouse Dashboard Pro"
  workbook.created = new Date()

  const summarySheet = workbook.addWorksheet("สรุป")
  summarySheet.columns = [{ width: 36 }, { width: 22 }]

  const titleRow = summarySheet.addRow(["สรุปรายงานคลังสินค้า"])
  summarySheet.mergeCells(1, 1, 1, 2)
  titleRow.height = 26
  titleRow.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }
  titleRow.alignment = { vertical: "middle" }
  titleRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } }
  })

  summarySheet.addRow(["ช่วงเวลา", data.period])
  summarySheet.addRow(["พนักงาน (ตัวกรอง)", data.employeeFilter])
  summarySheet.addRow([])

  const metricsHeaderRow = summarySheet.addRow(["ตัวชี้วัด", "ค่า"])
  metricsHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  metricsHeaderRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE } }
  })

  for (const item of data.summary) {
    const row = summarySheet.addRow([item.label, item.value])
    row.getCell(1).font = { bold: true }
    if (typeof item.value === "number") row.getCell(2).numFmt = "#,##0.0"
  }

  summarySheet.addRow([])
  const staffingRow = summarySheet.addRow(["สถานะกำลังคน", data.staffing.message])
  summarySheet.mergeCells(staffingRow.number, 2, staffingRow.number, 2)
  staffingRow.height = 20
  staffingRow.font = { bold: true, color: { argb: data.staffing.ok ? GREEN_TEXT : RED_TEXT } }
  staffingRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: data.staffing.ok ? GREEN_BG : RED_BG } }
    cell.alignment = { vertical: "middle", wrapText: true }
  })

  const dataSheet = workbook.addWorksheet(data.tableTitle)
  dataSheet.columns = data.tableHeaders.map((h) => ({ width: Math.max(12, h.length + 6) }))
  const headerRow = dataSheet.addRow(data.tableHeaders)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } }
  })
  dataSheet.views = [{ state: "frozen", ySplit: 1 }]
  data.tableRows.forEach((r) => dataSheet.addRow(r))
  if (data.tableRows.length > 0) {
    dataSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: data.tableHeaders.length } }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = data.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
