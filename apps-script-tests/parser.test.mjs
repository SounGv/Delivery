// Runs the pure helpers of apps-script/SheetParser.js in Node (the file is plain JavaScript, no build step).
// Run: node --test apps-script-tests
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"

const source = readFileSync(new URL("../apps-script/SheetParser.js", import.meta.url), "utf8")
const context = {}
vm.createContext(context)
vm.runInContext(source, context) // defines the top-level functions; nothing in them runs at load time
const { isPersonName_, mergeReceivingWarehouse_ } = context
// values built inside the vm have their own Array/Object prototypes; compare them as plain JSON
const plain = (v) => JSON.parse(JSON.stringify(v))

test("isPersonName_: names yes, figures and sentences no", () => {
  for (const name of ["ตั้น", "พอล", "อ้อม", "ปู(ปริ้นท์ขายดี)", " แต้ว "]) assert.equal(isPersonName_(name), true, name)
  for (const notName of [250, 0, "250", "911 GTE231026=1701", "", null, undefined, "พัสดุมาช้ากว่ากำหนด 30 นาที พัสดุมาช้ากว่ากำหนด 30 นาที"]) {
    assert.equal(isPersonName_(notName), false, String(notName))
  }
})

const person = (name, dateKey, v) => ({ name, byDate: { [dateKey]: { value1: v, value2: null } }, totalValue1: v, totalValue2: 0 })
const month = (dates, cats, metrics = []) => ({
  dates,
  departments: [{ title: "ฝ่ายรับเข้า", staff: [], staffCategories: cats, metrics }],
})

test("mergeReceivingWarehouse_: matches categories by title across months that renumbered them", () => {
  // July: 1 = items received, 2 = SKUs received.  August: 1 = SKUs received, 2 = items received (as department figures).
  const july = month(["2026-07-01"], [
    { id: "1", title: "จำนวนสินค้าที่รับเข้า", target: "ต่อบิลต่อเดือน", employees: [person("ตั้น", "2026-07-01", 10)] },
    { id: "2", title: "จำนวน SKU ที่รับสินค้าเข้า", target: "ต่อบิลต่อเดือน", employees: [person("พอล", "2026-07-01", 4)] },
  ])
  const august = month(
    ["2026-08-01"],
    [],
    [
      { id: "1", title: "จำนวน SKU ที่รับสินค้าเข้า", target: "", byDate: { "2026-08-01": "มารถ =9 SKU" } },
      { id: "2", title: "จำนวนสินค้าที่รับเข้า", target: "ต่อบิลต่อเดือน", byDate: { "2026-08-01": "911 =1701" } },
    ]
  )
  const merged = mergeReceivingWarehouse_(july, august)
  const dep = merged.departments[0]
  const titles = dep.staffCategories.map((c) => c.title)
  assert.deepEqual(plain(titles), ["จำนวนสินค้าที่รับเข้า", "จำนวน SKU ที่รับสินค้าเข้า"])
  assert.equal(new Set(titles).size, titles.length, "no title appears twice")
  // each person stays with the category of his own title
  assert.deepEqual(plain(dep.staffCategories[0].employees.map((e) => e.name)), ["ตั้น"])
  assert.deepEqual(plain(dep.staffCategories[1].employees.map((e) => e.name)), ["พอล"])
  assert.deepEqual(plain(dep.metrics.map((m) => m.title).sort()), ["จำนวน SKU ที่รับสินค้าเข้า", "จำนวนสินค้าที่รับเข้า"].sort())
})

test("mergeReceivingWarehouse_: the newer month's number is shown, and dates are the union", () => {
  const a = month(["2026-07-31"], [{ id: "1", title: "จำนวนสินค้าที่รับเข้า", target: "", employees: [person("ตั้น", "2026-07-31", 1)] }])
  const b = month(["2026-08-01"], [{ id: "2", title: "จำนวนสินค้าที่รับเข้า", target: "", employees: [person("ตั้น", "2026-08-01", 2)] }])
  const merged = mergeReceivingWarehouse_(a, b)
  assert.equal(merged.departments[0].staffCategories.length, 1)
  assert.equal(merged.departments[0].staffCategories[0].id, "2")
  assert.deepEqual(plain(merged.dates), ["2026-07-31", "2026-08-01"])
  assert.equal(merged.departments[0].staffCategories[0].employees[0].totalValue1, 3)
})

// ---- loadReprintReport_ against a fake sheet ----------------------------------------------------------------
function fakeSheet(rows) {
  const grid = rows
  return {
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    getRange: (_r, _c, nRows, nCols) => ({
      getValues: () => grid.slice(0, nRows).map((r) => r.slice(0, nCols)),
      getDisplayValues: () => grid.slice(0, nRows).map((r) => r.slice(0, nCols).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)))),
    }),
  }
}
function withSheet(sheet) {
  context.SpreadsheetApp = { openById: () => ({ getSheetByName: () => sheet, getSpreadsheetTimeZone: () => "Asia/Bangkok" }) }
  context.TEAM_REPORT_SOURCE_ID_ = "test"
  context.Logger = { log() {} }
}

test("loadReprintReport_: reads the rows by header text", () => {
  const header = ["วันที่", "เลขพัสดุ", "เลขคำสั่งซื้อ", "จำนวนครั้งที่พิมพ์", "รายละเอียดการพิมพ์", "รายการสินค้า"]
  const details = "ครั้งที่ 1: a@U1 2026-11-13 10:16:05 (กดพิมพ์เอง) | ครั้งที่ 2: a@U1 2026-11-13 10:16:17 (กดพิมพ์เอง)"
  withSheet(fakeSheet([header, ["2026-11-13", "BSUJR3R85160", "1128652601602384", 2, details, "75628 (สีดำ)"], ["", "", "", "", "", ""]]))
  const r = plain(context.loadReprintReport_())
  assert.equal(r.error, "")
  assert.equal(r.rows.length, 1)
  assert.deepEqual(r.rows[0], { date: "2026-11-13", packageNo: "BSUJR3R85160", orderNo: "1128652601602384", printCount: 2, details, items: "75628 (สีดำ)" })
})

test("loadReprintReport_: a missing tab or missing headers is reported, never thrown", () => {
  context.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null, getSpreadsheetTimeZone: () => "Asia/Bangkok" }) }
  context.TEAM_REPORT_SOURCE_ID_ = "test"
  context.Logger = { log() {} }
  assert.equal(plain(context.loadReprintReport_()).missingTab, "รายงานออเดอร์พิมพ์ซ้ำรายวัน")
  withSheet(fakeSheet([["a", "b"], ["1", "2"]]))
  const bad = plain(context.loadReprintReport_())
  assert.match(bad.error, /header columns not found/)
  assert.deepEqual(bad.rows, [])
})
