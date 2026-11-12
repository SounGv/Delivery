import { describe, expect, it } from "vitest"
import { LOST_CHASING, LOST_PAID, LOST_UNNOTED, buildTimelineItems, lostStageOf, type TimelineItem } from "./cancel-return-timeline"
import { actionItems, applyFilters, dailyReceived, exceptions, inSegment, latestDataDate, previousRange, rangeFor, rankBy, segmentItems, sortForSegment, summarize } from "./return-report"
import type { RefundCase, RestockRow } from "@/api/types"

function item(p: Partial<TimelineItem>): TimelineItem {
  return {
    id: Math.random().toString(36),
    kind: "return",
    date: null,
    dateNote: "",
    channel: "Shopee",
    sku: "SKU",
    qty: 1,
    orderNo: "",
    packageNo: "",
    status: { label: "ยังไม่ Stock-In", tone: "warn" },
    tag: "",
    extra: "",
    amount: null,
    arrivedOn: null,
    origin: "คืนจากลูกค้า",
    lostStage: null,
    stockDeducted: null,
    store: "",
    tracking: "",
    carrier: "",
    reason: "",
    ...p,
  }
}

describe("rangeFor / previousRange", () => {
  it("builds the day, yesterday and month ranges from today", () => {
    expect(rangeFor("today", "2026-11-12", null)).toEqual({ from: "2026-11-12", to: "2026-11-12" })
    expect(rangeFor("yesterday", "2026-11-12", null)).toEqual({ from: "2026-11-11", to: "2026-11-11" })
    expect(rangeFor("month", "2026-11-12", null)).toEqual({ from: "2026-11-01", to: "2026-11-12" })
  })

  it("ends the 7-day range on the newest day with data when the sheet is behind", () => {
    expect(rangeFor("7d", "2026-11-12", "2026-11-05")).toEqual({ from: "2026-10-30", to: "2026-11-05" })
    expect(rangeFor("7d", "2026-11-12", null)).toEqual({ from: "2026-11-06", to: "2026-11-12" })
    // data newer than the calendar day cannot move the window past today
    expect(rangeFor("7d", "2026-11-12", "2026-11-20")).toEqual({ from: "2026-11-06", to: "2026-11-12" })
  })

  it("orders a custom range and fills a missing end", () => {
    expect(rangeFor("custom", "2026-11-12", null, { from: "2026-11-08", to: "2026-11-03" })).toEqual({ from: "2026-11-03", to: "2026-11-08" })
    expect(rangeFor("custom", "2026-11-12", null, { from: "2026-11-08", to: "" })).toEqual({ from: "2026-11-08", to: "2026-11-08" })
  })

  it("takes the same number of days right before a range", () => {
    expect(previousRange({ from: "2026-10-30", to: "2026-11-05" })).toEqual({ from: "2026-10-23", to: "2026-10-29" })
    expect(previousRange({ from: "2026-11-12", to: "2026-11-12" })).toEqual({ from: "2026-11-11", to: "2026-11-11" })
  })
})

describe("latestDataDate", () => {
  it("ignores cancelled orders, which are dated up to today even when the returns file is days behind", () => {
    const items = [item({ arrivedOn: "2026-11-05" }), item({ kind: "cancel", date: "2026-11-12" })]
    expect(latestDataDate(items)).toBe("2026-11-05")
  })

  it("looks at both the line date and the arrival day", () => {
    const items = [item({ date: "2026-11-02" }), item({ date: "2026-10-30", arrivedOn: "2026-11-05" })]
    expect(latestDataDate(items)).toBe("2026-11-05")
    expect(latestDataDate([])).toBeNull()
  })
})

describe("summarize", () => {
  const range = { from: "2026-11-01", to: "2026-11-07" }
  const items: TimelineItem[] = [
    // received in the period (2 lines, 3 pieces), one received the week before
    item({ arrivedOn: "2026-11-02", qty: 1 }),
    item({ arrivedOn: "2026-11-07", qty: 2, status: LOST_PAID }),
    item({ arrivedOn: "2026-10-28" }),
    // outstanding: not paid; the paid one above is not outstanding
    item({ date: "2026-10-20", status: { label: "ไม่ Stock-In", tone: "danger" } }),
    // lost lines in the period, one per stage, plus one before and one undated
    item({ kind: "lost", date: "2026-11-03", lostStage: "none", amount: 100, status: LOST_CHASING }),
    item({ kind: "lost", date: "2026-11-04", lostStage: "claimed", amount: 200, status: LOST_CHASING }),
    item({ kind: "lost", date: "2026-11-05", lostStage: "unnoted", amount: 300, status: LOST_UNNOTED }),
    item({ kind: "lost", date: "2026-11-06", lostStage: "paid", amount: 400, status: LOST_PAID }),
    item({ kind: "lost", date: "2026-10-30", lostStage: "paid", amount: 50, status: LOST_PAID }),
    item({ kind: "lost", date: null, lostStage: "claimed", status: LOST_CHASING }),
    // cancelled orders: T1 two in the period (one still open), T2 one in the period and one open from long ago
    item({ kind: "cancel", date: "2026-11-02", stockDeducted: true, status: { label: "รอตรวจสอบ", tone: "warn" } }),
    item({ kind: "cancel", date: "2026-11-03", stockDeducted: true, status: { label: "รับแล้ว", tone: "ok" } }),
    item({ kind: "cancel", date: "2026-11-04", stockDeducted: false, status: { label: "ไม่ตรง", tone: "danger" } }),
    item({ kind: "cancel", date: "2026-08-04", stockDeducted: false, status: { label: "รอตรวจสอบ", tone: "warn" } }),
  ]
  const s = summarize(items, range, "2026-11-07")

  it("counts the goods received in the period and the week before", () => {
    expect(s.received).toEqual({ count: 2, qty: 3, amount: 0 })
    expect(s.receivedBefore.count).toBe(1)
  })

  it("counts outstanding goods now, ignoring the period, and finds the oldest", () => {
    // 3 lines are not paid: 2026-11-02, 2026-10-28 (arrived only) and 2026-10-20 (requested)
    expect(s.outstanding.count).toBe(3)
    expect(s.outstanding.oldestDays).toBe(18)
  })

  it("counts the lost lines of the period with their money", () => {
    expect(s.lost.count).toBe(4)
    expect(s.lost.amount).toBe(1000)
  })

  it("counts the open money stages right now on any date, and paid only inside the period", () => {
    // none: the line of 3 Nov; claimed: 4 Nov plus the undated one; unnoted: 5 Nov
    expect(s.money.none).toEqual({ count: 1, qty: 1, amount: 100 })
    expect(s.money.claimed.count).toBe(2)
    expect(s.money.claimed.amount).toBe(200)
    expect(s.money.unnoted.count).toBe(1)
    // paid: 6 Nov counts, 30 Oct (the week before) does not
    expect(s.money.paid).toEqual({ count: 1, qty: 1, amount: 400 })
  })

  it("keeps the earlier week and undated lines out of the period", () => {
    expect(s.lostBefore.count).toBe(1)
    expect(s.lostUndated).toBe(1)
  })

  it("counts cancelled orders per kind: in the period, still open in it, and open at all", () => {
    expect(s.cancelled.deducted).toEqual({ count: 2, open: 1, openAll: 1 })
    expect(s.cancelled.notDeducted).toEqual({ count: 1, open: 1, openAll: 2 })
  })
})

describe("applyFilters", () => {
  const items = [
    item({ channel: "Shopee", origin: "คืนจากลูกค้า" }),
    item({ channel: "Lazada", origin: "ยกเลิก-ตีกลับ" }),
    item({ channel: "Shopee", origin: "" }),
    item({ kind: "cancel", channel: "Shopee", origin: "" }),
  ]

  it("keeps cancelled orders and narrows by channel and origin", () => {
    expect(applyFilters(items, { channel: "", origin: "" })).toHaveLength(4)
    expect(applyFilters(items, { channel: "Shopee", origin: "" })).toHaveLength(3)
    expect(applyFilters(items, { channel: "", origin: "ยกเลิก-ตีกลับ" })).toHaveLength(1)
  })
})

describe("lostStageOf (matches the statuses the period report already shows)", () => {
  const refund = (p: Partial<RefundCase>): RefundCase =>
    ({ packageNo: "P1", caseResult: "รอเงินคืนจากขนส่ง", knownFrom: "", platformStatus: "สูญหาย", store: "", ...p }) as RefundCase
  const restock = (p: Partial<RestockRow>): RestockRow =>
    ({ packageNo: "P1", receiptStatus: "🟠 รอรับ", returnStatus: "สูญหาย", requestedAt: "2026-11-01 10:00", arrivedAt: "", store: "", returnTracking: "", ...p }) as RestockRow

  it("maps each case to one stage", () => {
    expect(lostStageOf(refund({}))).toBe("claimed")
    expect(lostStageOf(refund({ caseResult: "ได้เงินคืนแล้ว", knownFrom: "ข้อความ" }))).toBe("paid")
    expect(lostStageOf(refund({ caseResult: "ได้เงินคืนแล้ว", knownFrom: "ป้ายสี" }))).toBe("unnoted")
    expect(lostStageOf(undefined, restock({ receiptStatus: "💰 ได้เงินคืนแล้ว" }))).toBe("unnoted")
    expect(lostStageOf(undefined, restock({}))).toBe("none")
  })

  it("sets a stage on goods that are not lost but have a refund case, and none on those without", () => {
    const withCase = buildTimelineItems([], [restock({ returnStatus: "คืนสินค้าแล้ว" })], [refund({})])
    expect(withCase[0]?.kind).toBe("return")
    expect(withCase[0]?.lostStage).toBe("claimed")
    const without = buildTimelineItems([], [restock({ returnStatus: "คืนสินค้าแล้ว" })], [])
    expect(without[0]?.lostStage).toBeNull()
  })

  it("takes the money from the refund tab's selling price when there is a case, else from the restock row", () => {
    const withCase = buildTimelineItems([], [restock({ refundAmount: 500 })], [refund({ sellPrice: 800 })])
    expect(withCase[0]?.amount).toBe(800)
    const without = buildTimelineItems([], [restock({ refundAmount: 500 })], [])
    expect(without[0]?.amount).toBe(500)
  })

  it("gives each SKU of a parcel its own refund case and price", () => {
    const lines = buildTimelineItems(
      [],
      [restock({ sku: "A" }), restock({ sku: "B" })],
      [refund({ sku: "A", sellPrice: 100 }), refund({ sku: "B", sellPrice: 250, caseResult: "ได้เงินคืนแล้ว", knownFrom: "ข้อความ" })]
    )
    expect(lines.map((l) => [l.sku, l.amount, l.lostStage])).toEqual([
      ["A", 100, "claimed"],
      ["B", 250, "paid"],
    ])
  })

  it("flows into the merged lines for a restock line that has no refund case", () => {
    const [line] = buildTimelineItems([], [restock({})], [])
    expect(line?.kind).toBe("lost")
    expect(line?.lostStage).toBe("none")
    expect(line?.status.label).toBe(LOST_CHASING.label)
    expect(line?.date).toBe("2026-11-01")
  })
})

describe("segments, ordering and the list", () => {
  const range = { from: "2026-11-01", to: "2026-11-07" }
  const open = item({ id: "open", date: "2026-10-01" })
  const received = item({ id: "received", arrivedOn: "2026-11-03", status: LOST_PAID })
  const lostIn = item({ id: "lostIn", kind: "lost", date: "2026-11-04", lostStage: "claimed", status: LOST_CHASING })
  const lostOld = item({ id: "lostOld", kind: "lost", date: "2026-09-04", lostStage: "paid", status: LOST_PAID })
  const lostPaidIn = item({ id: "lostPaidIn", kind: "lost", date: "2026-11-05", lostStage: "paid", status: LOST_PAID })
  const undated = item({ id: "undated", kind: "lost", date: null, lostStage: "none", status: LOST_CHASING })
  const cancelT1 = item({ id: "t1", kind: "cancel", date: "2026-11-02", stockDeducted: true })
  const cancelT2 = item({ id: "t2", kind: "cancel", date: "2026-11-02", stockDeducted: false })
  const all = [open, received, lostIn, lostOld, lostPaidIn, undated, cancelT1, cancelT2]
  const ids = (seg: Parameters<typeof segmentItems>[1]) => segmentItems(all, seg, range).map((i) => i.id)

  it("matches what each card counts", () => {
    expect(ids("received")).toEqual(["received"])
    expect(ids("lost")).toEqual(["lostIn", "lostPaidIn"])
    expect(ids("claimed")).toEqual(["lostIn"])
    expect(ids("none")).toEqual(["undated"])
    expect(ids("paid")).toEqual(["lostPaidIn"]) // the August-ish paid line is outside the period
    expect(ids("cancelDeducted")).toEqual(["t1"])
    expect(ids("cancelNotDeducted")).toEqual(["t2"])
    expect(ids("lostUndated")).toEqual(["undated"])
  })

  it("'open' is the goods still waiting plus the money stages that need someone", () => {
    expect(ids("open")).toEqual(["open", "lostIn", "undated"])
    expect(inSegment(lostPaidIn, "open", range)).toBe(false)
  })

  it("sorts open work oldest first and the rest newest first, undated last", () => {
    expect(sortForSegment(segmentItems(all, "open", range), "open").map((i) => i.id)).toEqual(["open", "lostIn", "undated"])
    expect(sortForSegment([lostOld, lostPaidIn, undated], "lost").map((i) => i.id)).toEqual(["lostPaidIn", "lostOld", "undated"])
  })
})

describe("dailyReceived", () => {
  it("counts goods per arrival day by origin and marks days after the newest data as no data", () => {
    const items = [
      item({ arrivedOn: "2026-11-04", origin: "คืนจากลูกค้า" }),
      item({ arrivedOn: "2026-11-04", origin: "ยกเลิก-ตีกลับ" }),
      item({ arrivedOn: "2026-11-05", origin: "คืนจากลูกค้า" }),
      item({ kind: "lost", arrivedOn: "2026-11-05" }), // lost parcels are not "received"
    ]
    const days = dailyReceived(items, "2026-11-06", 3, "2026-11-05")
    expect(days.map((d) => [d.date, d.total, d.noData])).toEqual([
      ["2026-11-04", 2, false],
      ["2026-11-05", 1, false],
      ["2026-11-06", 0, true],
    ])
    expect(days[0]?.byOrigin).toEqual({ "คืนจากลูกค้า": 1, "ยกเลิก-ตีกลับ": 1 })
  })
})

describe("rankBy", () => {
  const range = { from: "2026-11-01", to: "2026-11-07" }
  const mk = (store: string, n: number) => Array.from({ length: n }, () => item({ arrivedOn: "2026-11-03", store }))

  it("ranks the stores, folds the tail into 'rest' and files a blank name under ไม่ระบุ", () => {
    const items = [...mk("A", 5), ...mk("B", 3), ...mk("C", 1), ...mk("D", 1), ...mk("", 2), item({ arrivedOn: "2026-10-01", store: "A" })]
    const r = rankBy(items, range, "store", 2)
    expect(r.total).toBe(12)
    expect(r.rows.map((x) => [x.name, x.count])).toEqual([["A", 5], ["B", 3]])
    expect(r.rest).toEqual({ names: 3, count: 4, share: 33 })
  })
})

describe("rankBy reason", () => {
  it("ranks the reasons the sheet gives and files lines without one under ไม่ระบุ", () => {
    const range = { from: "2026-11-01", to: "2026-11-07" }
    const items = [
      item({ arrivedOn: "2026-11-02", reason: "เปลี่ยนใจ" }),
      item({ arrivedOn: "2026-11-03", reason: "เปลี่ยนใจ" }),
      item({ arrivedOn: "2026-11-04", reason: "ตีกลับ: คำเตือน" }),
      item({ kind: "lost", date: "2026-11-05" }),
    ]
    const r = rankBy(items, range, "reason")
    expect(r.rows.map((x) => [x.name, x.count])).toEqual([["เปลี่ยนใจ", 2], ["ตีกลับ: คำเตือน", 1], ["ไม่ระบุ", 1]])
  })
})

describe("exceptions and actionItems", () => {
  const notStocked = item({ id: "ns", arrivedOn: "2026-11-02", date: "2026-11-01", status: { label: "ไม่ Stock-In", tone: "danger" } })
  const unnoted = item({ id: "un", kind: "lost", date: "2026-11-03", lostStage: "unnoted", amount: 50, status: LOST_UNNOTED })
  const none = item({ id: "none", kind: "lost", date: "2026-10-20", lostStage: "none", status: LOST_CHASING })
  const noneOlder = item({ id: "noneOld", kind: "lost", date: "2026-10-01", lostStage: "none", status: LOST_CHASING })
  const waiting = item({ id: "wait", date: "2026-09-01" })
  const undated = item({ id: "ud", kind: "lost", date: null, lostStage: "claimed", status: LOST_CHASING })
  const all = [waiting, notStocked, unnoted, none, noneOlder, undated]

  it("counts the lines worth checking", () => {
    const e = exceptions(all)
    expect(e.unnoted).toEqual({ count: 1, qty: 1, amount: 50 })
    expect(e.arrivedNotStockedIn.count).toBe(1)
    expect(e.lostUndated.count).toBe(1)
  })

  it("puts 'not started' first, longest wait first inside a group, and reports the full count", () => {
    const { list, total } = actionItems(all, "2026-11-07", 4)
    expect(total).toBe(6)
    expect(list.map((a) => a.item.id)).toEqual(["noneOld", "none", "ns", "un"])
    expect(list[0]?.ageDays).toBe(37)
    expect(list[0]?.todo).toContain("ขอเงินคืน")
  })
})
