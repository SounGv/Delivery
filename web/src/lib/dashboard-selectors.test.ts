import { describe, expect, it } from "vitest"
import type { DashboardResponse, Employee } from "@/api/types"
import {
  ROSTER_WINDOW_DAYS,
  buildFollowUpRows,
  computeTeamTotalsByDate,
  latestOutputDate,
  recentlyActiveEmployees,
} from "./dashboard-selectors"

/** A person with the given per-day parcel counts (items default to 0). */
function person(name: string, parcelsByDate: Record<string, number | null>, team: Employee["team"] = "online"): Employee {
  const byDate: Employee["byDate"] = {}
  for (const [date, parcels] of Object.entries(parcelsByDate)) byDate[date] = { parcels, items: 0 }
  return { name, team, byDate, totalParcels: 0, totalItems: 0 }
}

describe("latestOutputDate", () => {
  it("returns the newest day on which someone had parcels or items, ignoring empty days", () => {
    const people = [person("A", { "2026-11-05": 10, "2026-11-07": 0 }), person("B", { "2026-11-06": 4, "2026-11-08": null })]
    expect(latestOutputDate(people)).toBe("2026-11-06")
  })

  it("counts items as output too", () => {
    const p: Employee = { name: "A", byDate: { "2026-11-09": { parcels: 0, items: 3 } }, totalParcels: 0, totalItems: 3 }
    expect(latestOutputDate([p])).toBe("2026-11-09")
  })

  it("is null when nobody has any output", () => {
    expect(latestOutputDate([person("A", { "2026-11-01": 0 })])).toBeNull()
    expect(latestOutputDate([])).toBeNull()
  })
})

describe("recentlyActiveEmployees (30-day roster)", () => {
  const today = "2026-11-07"

  it("uses a 30-day window", () => {
    expect(ROSTER_WINDOW_DAYS).toBe(30)
  })

  it("keeps someone who worked today or on the first day of the window, drops someone one day before it", () => {
    // window = 2026-10-09 .. 2026-11-07 (30 days, both ends included)
    const people = [
      person("today", { [today]: 5 }),
      person("firstDay", { "2026-10-09": 5 }),
      person("oneDayTooOld", { "2026-10-08": 5 }),
    ]
    expect(recentlyActiveEmployees(people, today).map((e) => e.name)).toEqual(["today", "firstDay"])
  })

  it("drops people whose only entries are zero or empty, and one-day names long ago", () => {
    const people = [
      person("zeroOnly", { "2026-11-01": 0, "2026-11-02": null }),
      person("aliasMay", { "2026-05-16": 12 }),
      person("real", { "2026-11-03": 20 }),
    ]
    expect(recentlyActiveEmployees(people, today).map((e) => e.name)).toEqual(["real"])
  })

  it("ignores output after the reference day", () => {
    expect(recentlyActiveEmployees([person("future", { "2026-11-20": 9 })], today)).toEqual([])
  })

  it("accepts a custom window", () => {
    const people = [person("A", { "2026-11-01": 3 })]
    expect(recentlyActiveEmployees(people, today, 7)).toHaveLength(1)
    expect(recentlyActiveEmployees(people, today, 6)).toHaveLength(0)
  })
})

describe("computeTeamTotalsByDate", () => {
  it("sums parcels and items per day and counts only people with output as active", () => {
    const a = person("A", { "2026-11-06": 10, "2026-11-07": 0 })
    const b = person("B", { "2026-11-06": 5, "2026-11-07": null })
    const totals = computeTeamTotalsByDate([a, b], ["2026-11-06", "2026-11-07", "2026-11-08"])
    expect(totals["2026-11-06"]).toEqual({ parcels: 15, items: 0, activeEmployees: 2 })
    expect(totals["2026-11-07"]).toEqual({ parcels: 0, items: 0, activeEmployees: 0 })
    expect(totals["2026-11-08"]).toEqual({ parcels: 0, items: 0, activeEmployees: 0 })
  })

  it("keeps everyone's history in the totals, even people the roster hides", () => {
    const aliasLongAgo = person("alias", { "2026-05-16": 12 })
    const totals = computeTeamTotalsByDate([aliasLongAgo], ["2026-05-16"])
    expect(totals["2026-05-16"]?.parcels).toBe(12)
  })
})

describe("buildFollowUpRows", () => {
  const dates = ["2026-11-05", "2026-11-06", "2026-11-07"]
  const data = {
    todayDate: "2026-11-07",
    dates,
    employees: [
      person("OnTarget", { "2026-11-06": 100, "2026-11-07": 120 }),
      person("NoRecord", { "2026-11-06": 100 }),
      person("BelowTarget", { "2026-11-06": 100, "2026-11-07": 40 }),
    ],
    teamTotalsByDate: {},
  } as unknown as DashboardResponse

  it("returns one row per employee, highest risk first and people with no record for today last", () => {
    const rows = buildFollowUpRows(data, 100)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.name)).toEqual(["BelowTarget", "OnTarget", "NoRecord"])
    expect(rows[0]?.status).toBe("below-target")
    expect(rows[2]?.status).toBe("no-data")
  })

  it("does not call a missing day below target", () => {
    const row = buildFollowUpRows(data, 100).find((r) => r.name === "NoRecord")
    expect(row?.todayOutput).toBeNull()
    expect(row?.consecutiveDaysBelow).toBe(0)
  })
})
