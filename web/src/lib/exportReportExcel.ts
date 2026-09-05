export interface SummaryItem {
  label: string
  value: string | number
}

/** One employee's row in the full ranking table (already sorted 1..N by the caller). */
export interface RankingRow {
  rank: number
  name: string
  parcels: number
  items: number
  sharePct: number
}

/**
 * Splits `tableRows` into one worksheet per group (e.g. one per month) instead of a
 * single flat sheet. Each sheet gets its own header, a bold subtotal row, and the
 * "สรุป" sheet gets an index table linking to every group — so a wide date range
 * (e.g. มี.ค.–ส.ค.) reads as separate, navigable monthly sections instead of one
 * giant undifferentiated block.
 */
export interface ReportExcelGroupBy {
  /** Column index (0-based) in `tableRows` whose value determines the group. */
  keyColumnIndex: number
  /** Maps a row's raw key (e.g. "2026-03-05") to its group key (e.g. "2026-03"). */
  keyOf: (rawKey: string | number) => string
  /** Maps a group key to a human label used for the sheet tab and index table. */
  labelOf: (groupKey: string) => string
  /** Column indices (0-based) to sum for each group's subtotal row / index table. */
  sumColumnIndexes: number[]
  /** Header labels for `sumColumnIndexes`, in the same order (used in the index table). */
  sumColumnHeaders: string[]
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
  groupBy?: ReportExcelGroupBy
  /** Full team ranking (all employees, not just the top 1) for the selected range. */
  ranking?: RankingRow[]
}

const BRAND_BLUE = "FF2563EB"
const SLATE = "FF334155"
const GREEN_BG = "FFD1FAE5"
const GREEN_TEXT = "FF065F46"
const RED_BG = "FFFEE2E2"
const RED_TEXT = "FF991B1B"
const SUBTOTAL_BG = "FFE2E8F0"
const GOLD_BG = "FFFEF3C7"
const SILVER_BG = "FFE5E7EB"
const BRONZE_BG = "FFFED7AA"

/** Text-based bar (e.g. "███████░░░ 65%") so the ranking reads as a mini-chart even
 * where Excel conditional-formatting data bars don't survive an xlsx->Google Sheets
 * import faithfully. */
const BAR_WIDTH = 20
function makeBar(value: number, max: number): string {
  if (max <= 0) return "░".repeat(BAR_WIDTH)
  const filled = Math.round(Math.max(0, Math.min(1, value / max)) * BAR_WIDTH)
  return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled)
}

/** Excel sheet names: max 31 chars, no : \ / ? * [ ], never blank, never repeated. */
function sanitizeSheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet"
  let candidate = name
  let n = 2
  while (used.has(candidate)) {
    const suffix = ` (${n++})`
    candidate = name.slice(0, 31 - suffix.length) + suffix
  }
  used.add(candidate)
  return candidate
}

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

  const usedSheetNames = new Set<string>(["สรุป"])

  // Full ranking — "พนักงานยอดเยี่ยม" above only names #1; managers need the whole
  // 1..N order to tell where everyone stands, not just who's on top.
  if (data.ranking && data.ranking.length > 0) {
    const rankingSheetName = sanitizeSheetName("อันดับพนักงาน", usedSheetNames)

    summarySheet.addRow([])
    const rankLinkRow = summarySheet.addRow(["ดูอันดับพนักงานทั้งหมด"])
    summarySheet.mergeCells(rankLinkRow.number, 1, rankLinkRow.number, 2)
    rankLinkRow.getCell(1).value = { text: `ดูอันดับพนักงานทั้งหมด (${data.ranking.length} คน) →`, hyperlink: `#'${rankingSheetName}'!A1` }
    rankLinkRow.font = { bold: true, color: { argb: BRAND_BLUE }, underline: true }

    const rankSheet = workbook.addWorksheet(rankingSheetName)
    rankSheet.columns = [
      { width: 8 }, { width: 22 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: BAR_WIDTH + 4 },
    ]

    const rankTitleRow = rankSheet.addRow(["อันดับพนักงาน — เรียงตามพัสดุ (มากไปน้อย)"])
    rankSheet.mergeCells(1, 1, 1, 7)
    rankTitleRow.height = 22
    rankTitleRow.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }
    rankTitleRow.alignment = { vertical: "middle" }
    rankTitleRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } }
    })

    const rankHeaderRow = rankSheet.addRow(["ลำดับ", "พนักงาน", "พัสดุ", "สินค้า", "รวม", "สัดส่วนทีม (%)", "กราฟ"])
    rankHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
    rankHeaderRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE } }
    })
    rankSheet.views = [{ state: "frozen", ySplit: 2 }]

    // Bar length tracks `parcels` specifically — that's the same metric `rank` is
    // sorted by, so the bars visually agree with the row order instead of a
    // combined-total bar occasionally being longer for a LOWER-ranked row.
    const maxParcels = Math.max(1, ...data.ranking.map((r) => r.parcels))
    for (const r of data.ranking) {
      const total = r.parcels + r.items
      const row = rankSheet.addRow([r.rank, r.name, r.parcels, r.items, total, Number(r.sharePct.toFixed(1)), makeBar(r.parcels, maxParcels)])
      row.getCell(7).font = { name: "Consolas", color: { argb: BRAND_BLUE } }
      if (r.rank <= 3) {
        const bg = r.rank === 1 ? GOLD_BG : r.rank === 2 ? SILVER_BG : BRONZE_BG
        row.font = { bold: true }
        row.eachCell((cell, colNumber) => {
          if (colNumber !== 7) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } }
        })
      }
    }
    rankSheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 7 } }
  }

  if (data.groupBy) {
    const { keyColumnIndex, keyOf, labelOf, sumColumnIndexes, sumColumnHeaders } = data.groupBy

    const groups = new Map<string, (string | number)[][]>()
    for (const row of data.tableRows) {
      const key = keyOf(row[keyColumnIndex] ?? "")
      const bucket = groups.get(key)
      if (bucket) bucket.push(row)
      else groups.set(key, [row])
    }
    const sortedKeys = [...groups.keys()].sort()

    // Index table on the summary sheet: one row per group with its subtotals and a
    // hyperlink straight to that group's sheet.
    summarySheet.addRow([])
    const indexHeaderRow = summarySheet.addRow(["สรุปแยกตามกลุ่ม", ...sumColumnHeaders])
    indexHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
    indexHeaderRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE } }
    })

    const sheetNameByKey = new Map<string, string>()
    for (const key of sortedKeys) {
      sheetNameByKey.set(key, sanitizeSheetName(labelOf(key), usedSheetNames))
    }

    for (const key of sortedKeys) {
      const rows = groups.get(key)!
      const sums = sumColumnIndexes.map((ci) => rows.reduce((s, r) => s + (Number(r[ci]) || 0), 0))
      const indexRow = summarySheet.addRow([labelOf(key), ...sums])
      indexRow.getCell(1).font = {
        bold: true,
        color: { argb: BRAND_BLUE },
        underline: true,
      }
      indexRow.getCell(1).value = { text: labelOf(key), hyperlink: `#'${sheetNameByKey.get(key)}'!A1` }
    }

    const grandTotalRow = summarySheet.addRow([
      "รวมทุกกลุ่ม",
      ...sumColumnIndexes.map((ci) => data.tableRows.reduce((s, r) => s + (Number(r[ci]) || 0), 0)),
    ])
    grandTotalRow.font = { bold: true }
    grandTotalRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_BG } }
    })

    // One worksheet per group: header + that group's rows + a bold subtotal row.
    for (const key of sortedKeys) {
      const rows = groups.get(key)!
      const sheet = workbook.addWorksheet(sheetNameByKey.get(key)!)
      sheet.columns = data.tableHeaders.map((h) => ({ width: Math.max(12, h.length + 6) }))

      const groupTitleRow = sheet.addRow([labelOf(key)])
      sheet.mergeCells(1, 1, 1, data.tableHeaders.length)
      groupTitleRow.height = 22
      groupTitleRow.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }
      groupTitleRow.alignment = { vertical: "middle" }
      groupTitleRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } }
      })

      const headerRow = sheet.addRow(data.tableHeaders)
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE } }
      })
      sheet.views = [{ state: "frozen", ySplit: 2 }]

      rows.forEach((r) => sheet.addRow(r))

      const subtotal: (string | number)[] = data.tableHeaders.map(() => "")
      subtotal[0] = `รวม ${labelOf(key)} (${rows.length} รายการ)`
      sumColumnIndexes.forEach((ci) => {
        subtotal[ci] = rows.reduce((s, r) => s + (Number(r[ci]) || 0), 0)
      })
      const subtotalRow = sheet.addRow(subtotal)
      subtotalRow.font = { bold: true }
      subtotalRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_BG } }
      })

      sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: data.tableHeaders.length } }
    }
  } else {
    const dataSheet = workbook.addWorksheet(sanitizeSheetName(data.tableTitle, usedSheetNames))
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
