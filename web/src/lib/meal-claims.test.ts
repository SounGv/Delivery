import { describe, expect, it } from "vitest"
import type { Employee, MealsReportData } from "@/api/types"
import { CLAIM_LABEL, LATE_LABEL, crossCheckMeals, dailyMeals, dayLines, latestMealDate, summarizeMeals } from "./meal-claims"

// A slice of the real tab "เบิกค่าข้าว" (Nov 2026): 80 baht claims, and late-stay minutes of people who do not claim.
const report: MealsReportData = {
  dates: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-25"],
  claims: [
    // "-" in the tab comes as 0: written, no claim
    { name: "ปู", byDate: { "2026-11-02": 80, "2026-11-03": 80, "2026-11-04": 0, "2026-11-10": 0, "2026-11-11": 80, "2026-11-12": 80 } },
    { name: "บี้", byDate: { "2026-11-11": 80 } },
    { name: "ตอม", byDate: { "2026-11-02": 80 } },
  ],
  lateStays: [
    { name: "ลูกอม", byDate: {} },
    { name: "แคท", byDate: { "2026-11-11": { minutes: 60, text: "60 นาที" }, "2026-11-12": { minutes: 60, text: "60 นาที" } } },
    {
      name: "เบ้น",
      byDate: {
        "2026-11-10": { minutes: 60, text: "60 นาที" },
        "2026-11-11": { minutes: 60, text: "60 นาที" },
        "2026-11-12": { minutes: 60, text: "60 นาที" },
      },
    },
  ],
  notes: [],
  unreadCells: [],
  missingTab: "",
  error: "",
}
const week = { from: "2026-11-02", to: "2026-11-12" }

describe("latestMealDate", () => {
  it("ignores the columns for days still to come", () => {
    expect(latestMealDate(report)).toBe("2026-11-12")
    expect(latestMealDate({ ...report, claims: [], lateStays: [] })).toBeNull()
  })
})

describe("summarizeMeals", () => {
  const { summary, people } = summarizeMeals(report, week)

  it("adds up the money and the claims in the period", () => {
    expect(summary).toMatchObject({ amount: 480, claims: 6, claimants: 3, lateDays: 5, lateMinutes: 300, latePeople: 2 })
  })

  it("lists people with money first and leaves out those with nothing in the period", () => {
    expect(people.map((p) => [p.name, p.amount, p.claimDays, p.lateMinutes])).toEqual([
      ["ปู", 320, 4, 0],
      ["ตอม", 80, 1, 0],
      ["บี้", 80, 1, 0],
      ["เบ้น", 0, 0, 180],
      ["แคท", 0, 0, 120],
    ])
    expect(people.find((p) => p.name === "ปู")?.claimDates).toEqual(["2026-11-02", "2026-11-03", "2026-11-11", "2026-11-12"])
  })

  it("compares with the days before and narrows to one person", () => {
    const s = summarizeMeals(report, { from: "2026-11-11", to: "2026-11-12" })
    expect(s.summary.amount).toBe(240)
    expect(s.summary.claimsBefore).toBe(0)
    expect(summarizeMeals(report, week, "ปู").summary).toMatchObject({ amount: 320, claimants: 1, lateDays: 0 })
  })
})

describe("daily lines and bars", () => {
  it("draws people per day split into claim and late stay, and marks days after the newest as no data", () => {
    const days = dailyMeals(report, "2026-11-13", 4, "2026-11-12")
    expect(days.map((d) => [d.date, d.total, d.noData])).toEqual([
      ["2026-11-10", 1, false],
      ["2026-11-11", 4, false],
      ["2026-11-12", 3, false],
      ["2026-11-13", 0, true],
    ])
    expect(days[1]?.byOrigin).toEqual({ [CLAIM_LABEL]: 2, [LATE_LABEL]: 2 })
  })

  it("makes one line per day, newest first, with the names", () => {
    const lines = dayLines(report, week)
    expect(lines.map((l) => [l.date, l.amount])).toEqual([
      ["2026-11-12", 80],
      ["2026-11-11", 160],
      ["2026-11-10", 0],
      ["2026-11-03", 80],
      ["2026-11-02", 160],
    ])
    expect(lines[1]?.claimed.map((c) => c.name)).toEqual(["ปู", "บี้"])
    expect(lines[1]?.late.map((c) => c.name)).toEqual(["แคท", "เบ้น"])
  })
})

describe("crossCheckMeals", () => {
  const person = (name: string, outs: Record<string, string>): Employee => ({
    name,
    byDate: Object.fromEntries(Object.entries(outs).map(([d, t]) => [d, { parcels: 1, items: 1, checkIn: "08:30", checkOut: t }])),
    totalParcels: 0,
    totalItems: 0,
  })
  const employees = [
    // claimed on 2, 3, 11 (left 19:00); on the 4th left 19:40 without a claim; on the 12th claimed but left 18:00
    person("ปู", { "2026-11-02": "19:00", "2026-11-03": "19:00", "2026-11-04": "19:40", "2026-11-11": "19:00", "2026-11-12": "18:00" }),
    // claimed on the 11th and no check-out recorded at all
    person("บี้", {}),
    // two crews share the name: one of them left late, which is enough evidence for the claim
    person("ตอม", { "2026-11-02": "18:00" }),
    person("ตอม", { "2026-11-02": "19:05", "2026-11-11": "19:30" }),
  ]
  const { checks, unfilled } = crossCheckMeals(report, employees, week, "2026-11-12")

  it("flags a late check-out without a claim, and a claim without a late check-out", () => {
    expect(checks.map((c) => [c.name, c.date, c.kind, c.checkOut])).toEqual([
      ["ปู", "2026-11-12", "claim-no-late", "18:00"],
      ["บี้", "2026-11-11", "claim-no-late", null],
      ["ปู", "2026-11-04", "late-no-claim", "19:40"],
    ])
  })

  it("counts one late check-out among several people of the same name as evidence", () => {
    expect(checks.some((c) => c.name === "ตอม" && c.date === "2026-11-02")).toBe(false)
  })

  it("sets days after a person's last filled cell apart as not filled in yet, not as forgotten", () => {
    expect(checks.some((c) => c.name === "ตอม")).toBe(false)
    expect(unfilled).toEqual([{ name: "ตอม", lastFilled: "2026-11-02", days: [{ date: "2026-11-11", checkOut: "19:30" }] }])
  })

  it("does not look at days the tab is not filled to yet, or at people who do not claim", () => {
    expect(crossCheckMeals(report, employees, { from: "2026-11-13", to: "2026-11-25" }, "2026-11-12")).toEqual({ checks: [], unfilled: [] })
    expect(crossCheckMeals(report, employees, week, null)).toEqual({ checks: [], unfilled: [] })
    expect(checks.some((c) => c.name === "แคท")).toBe(false)
  })
})
