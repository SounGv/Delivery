import { describe, expect, it } from "vitest"
import type { ReprintRow } from "@/api/types"
import {
  dailyReprints,
  HEAVY_LABEL,
  inReprintSegment,
  latestReprintDate,
  NORMAL_LABEL,
  parsePrintDetails,
  rankPressers,
  summarizeReprints,
  toCase,
} from "./reprint-report"

// The six rows of the sheet tab "รายงานออเดอร์พิมพ์ซ้ำรายวัน" on 2026-11-17, as the sheet wrote them.
const ROWS: ReprintRow[] = [
  { date: "2026-11-13", packageNo: "BSUJR3R85160", orderNo: "1128652601602384", printCount: 2, items: "75628 (สีดำ)",
    details: "ครั้งที่ 1: st_oei@UJR3063161 2026-11-13 10:16:05 (กดพิมพ์เอง) | ครั้งที่ 2: st_oei@UJR3063161 2026-11-13 10:16:17 (กดพิมพ์เอง)" },
  { date: "2026-11-13", packageNo: "BSUJR3R85416", orderNo: "2611135VVVTCU4", printCount: 2, items: "35622",
    details: "ครั้งที่ 1: St_Cat@UJR3162873 2026-11-13 09:25:11 (กดพิมพ์เอง) | ครั้งที่ 2: St_Cat@UJR3162873 2026-11-13 09:25:12 (กดพิมพ์เอง)" },
  { date: "2026-11-13", packageNo: "BSUJR3R85616", orderNo: "1128638886616250", printCount: 2, items: "55917",
    details: "ครั้งที่ 1: st_nuch@UJR3063150 2026-11-13 10:29:21 (กดพิมพ์เอง) | ครั้งที่ 2: st_nuch@UJR3063150 2026-11-13 14:33:55 (กดพิมพ์เอง)" },
  { date: "2026-11-16", packageNo: "BSUJR3R94101", orderNo: "261116EJGX8F7M", printCount: 5, items: "75628 (สีดำ)",
    details: "ครั้งที่ 1: whan@UJR3010718 2026-11-16 11:39:00 (ระบบทำเครื่องหมายอัตโนมัติ) | ครั้งที่ 2: whan@UJR3010718 2026-11-16 12:28:18 (กดพิมพ์เอง) | ครั้งที่ 3: st_oei@UJR3063161 2026-11-16 12:28:27 (กดพิมพ์เอง) | ครั้งที่ 4: st_oei@UJR3063161 2026-11-16 12:28:47 (กดพิมพ์เอง) | ครั้งที่ 5: st_oei@UJR3063161 2026-11-16 12:28:56 (กดพิมพ์เอง)" },
  { date: "2026-11-16", packageNo: "BSUJR3R93623", orderNo: "587208048440412044", printCount: 4, items: "25908 (1 เมตร)",
    details: "ครั้งที่ 1: st_Ben@UJR3218485 2026-11-16 11:15:53 (ระบบทำเครื่องหมายอัตโนมัติ) | ครั้งที่ 2: st_Ben@UJR3218485 2026-11-16 11:17:39 (กดพิมพ์เอง) | ครั้งที่ 3: st_Ben@UJR3218485 2026-11-16 11:17:52 (กดพิมพ์เอง) | ครั้งที่ 4: st_Ben@UJR3218485 2026-11-16 11:18:03 (กดพิมพ์เอง)" },
]
const cases = ROWS.map(toCase)
const byPkg = (p: string) => cases.find((c) => c.packageNo === p)!

describe("parsePrintDetails", () => {
  it("reads every print with who, when and how", () => {
    const events = parsePrintDetails(ROWS[3]!.details)
    expect(events.map((e) => [e.n, e.user, e.time, e.method])).toEqual([
      [1, "whan", "11:39:00", "auto"],
      [2, "whan", "12:28:18", "manual"],
      [3, "st_oei", "12:28:27", "manual"],
      [4, "st_oei", "12:28:47", "manual"],
      [5, "st_oei", "12:28:56", "manual"],
    ])
    expect(events[0]?.account).toBe("UJR3010718")
    expect(events[0]?.methodLabel).toBe("ระบบทำเครื่องหมายอัตโนมัติ")
  })

  it("gives nothing for text it does not recognise instead of guessing", () => {
    expect(parsePrintDetails("")).toEqual([])
    expect(parsePrintDetails("พิมพ์ 2 ครั้ง")).toEqual([])
  })
})

describe("toCase flags", () => {
  it("marks a double press (two prints a second apart)", () => {
    expect(byPkg("BSUJR3R85416").rapid).toBe(true)
    expect(byPkg("BSUJR3R85160").rapid).toBe(true) // 12 seconds
    expect(byPkg("BSUJR3R85616").rapid).toBe(false) // four hours apart
  })

  it("marks four prints or more as heavy, as the sheet paints them red", () => {
    expect(cases.filter((c) => c.heavy).map((c) => c.packageNo)).toEqual(["BSUJR3R94101", "BSUJR3R93623"])
  })

  it("lists who printed, and whether more than one account did", () => {
    expect(byPkg("BSUJR3R94101").staff).toEqual(["whan", "st_oei"])
    expect(byPkg("BSUJR3R94101").multiStaff).toBe(true)
    expect(byPkg("BSUJR3R93623").multiStaff).toBe(false)
  })

  it("counts hand presses and system marks apart", () => {
    expect(byPkg("BSUJR3R94101")).toMatchObject({ manualPresses: 4, autoMarks: 1 })
    expect(byPkg("BSUJR3R85160")).toMatchObject({ manualPresses: 2, autoMarks: 0 })
  })
})

describe("when the sheet's count column differs from the lines of its details", () => {
  // A row of the tab on 2026-11-17: count column 2, six prints listed.
  const row: ReprintRow = {
    date: "2026-11-17", packageNo: "BSUJR3R96229", orderNo: "x", printCount: 2, items: "",
    details: [1, 2, 3, 4, 5, 6].map((n) => `ครั้งที่ ${n}: St_Cat@UJR3162873 2026-11-17 09:18:${40 + n} (กดพิมพ์เอง)`).join(" | "),
  }
  const c = toCase(row)

  it("uses the sheet's count as the number of prints and keeps the number of detail lines beside it", () => {
    expect(c.prints).toBe(2)
    expect(c.logLines).toBe(6)
    expect(c.countMismatch).toBe(true)
    expect(c.heavy).toBe(false)
  })

  it("adds up the sheet's counts in the summary and counts the mismatches", () => {
    const s = summarizeReprints([c, ...cases], { from: "2026-11-10", to: "2026-11-17" })
    expect(s.prints).toBe(15 + 2)
    expect(s.countMismatch).toBe(1)
  })

  it("keeps the sheet's count when the details cannot be read, with no lines to compare", () => {
    const unreadable = toCase({ ...row, details: "texto desconocido" })
    expect(unreadable.prints).toBe(2)
    expect(unreadable.logLines).toBe(0)
    expect(unreadable.countMismatch).toBe(false)
    expect(toCase({ ...row, printCount: 0 }).prints).toBe(6)
  })
})

describe("summaries", () => {
  const week = { from: "2026-11-10", to: "2026-11-16" }

  it("finds the newest day", () => {
    expect(latestReprintDate(cases)).toBe("2026-11-16")
    expect(latestReprintDate([])).toBeNull()
  })

  it("sums the period and compares it with the days before", () => {
    const s = summarizeReprints(cases, week)
    expect(s).toMatchObject({ orders: 5, prints: 15, manualPresses: 13, heavy: 2, rapid: 4, multiStaff: 1, ordersBefore: 0 })
    expect(summarizeReprints(cases, { from: "2026-11-16", to: "2026-11-16" }).orders).toBe(2)
  })

  it("draws a day with nothing as 0, and the days after the newest row as no data", () => {
    const days = dailyReprints(cases, "2026-11-17", 5, "2026-11-16")
    expect(days.map((d) => [d.date, d.total, d.noData])).toEqual([
      ["2026-11-13", 3, false],
      ["2026-11-14", 0, false],
      ["2026-11-15", 0, false],
      ["2026-11-16", 2, false],
      ["2026-11-17", 0, true],
    ])
    expect(days[3]?.byOrigin).toEqual({ [HEAVY_LABEL]: 2 })
    expect(days[0]?.byOrigin).toEqual({ [NORMAL_LABEL]: 3 })
  })

  it("ranks who pressed print again, counting from the second print", () => {
    const r = rankPressers(cases, week)
    // st_oei: 1 + 3 = 4 · st_Ben: 3 · St_Cat: 1 · st_nuch: 1 · whan: 1 (hand presses: 2+2+2+4+3 = 13)
    expect(r.rows.map((x) => [x.name, x.count])).toEqual([["st_oei", 4], ["st_Ben", 3], ["St_Cat", 1], ["st_nuch", 1], ["whan", 1]])
    expect(r.total).toBe(10)
  })

  it("filters by segment", () => {
    expect(cases.filter((c) => inReprintSegment(c, "multiStaff")).length).toBe(1)
    expect(cases.filter((c) => inReprintSegment(c, "all")).length).toBe(5)
  })
})
