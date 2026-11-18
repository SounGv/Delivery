import { describe, expect, it } from "vitest"
import type { MealsReportData } from "@/api/types"
import { buildPersonTypes, canonicalName, makeKeepPerson } from "./people-type"

// A slice of the tab "เบิกค่าข้าว": claim block = regular staff, late-stay (OT) block = daily-wage staff.
const meals: MealsReportData = {
  dates: ["2026-11-02"],
  claims: [
    { name: "ปู", byDate: { "2026-11-02": 80 } },
    { name: "เอิท", byDate: { "2026-11-02": 80 } },
  ],
  lateStays: [{ name: "แคท", byDate: { "2026-11-02": { minutes: 60, text: "60 นาที" } } }],
  notes: [],
  unreadCells: [],
  missingTab: "",
  error: "",
}

describe("buildPersonTypes", () => {
  const types = buildPersonTypes(meals)

  it("reads the claim block as regular staff and the OT block as daily-wage staff", () => {
    expect(types.get("ปู")).toBe("regular")
    expect(types.get("แคท")).toBe("daily")
  })

  it("keys a person by the spelling of the team sheet, so a spelling variant finds the same type", () => {
    expect(canonicalName("เอิท")).toBe("เอิร์ท")
    expect(types.get("เอิร์ท")).toBe("regular")
    expect(types.has("เอิท")).toBe(false)
  })

  it("knows nothing when the tab was not read", () => {
    expect(buildPersonTypes(undefined).size).toBe(0)
  })
})

describe("makeKeepPerson", () => {
  const types = buildPersonTypes(meals)

  it("lets everyone through when no filter is on, including people of unknown type", () => {
    const keep = makeKeepPerson(types, "all", "")
    expect(["ปู", "แคท", "ไม่รู้จัก"].every(keep)).toBe(true)
  })

  it("keeps only the chosen type, and leaves out people whose type is unknown", () => {
    const regular = makeKeepPerson(types, "regular", "")
    expect(["ปู", "เอิร์ท", "เอิท", "แคท", "ไม่รู้จัก"].filter(regular)).toEqual(["ปู", "เอิร์ท", "เอิท"])
    expect(["ปู", "แคท", "ไม่รู้จัก"].filter(makeKeepPerson(types, "daily", ""))).toEqual(["แคท"])
  })

  it("keeps only the chosen person, whichever spelling the data uses", () => {
    const keep = makeKeepPerson(types, "all", "เอิร์ท")
    expect(["เอิร์ท", "เอิท", "ปู"].filter(keep)).toEqual(["เอิร์ท", "เอิท"])
  })

  it("needs both to hold when a type and a person are chosen", () => {
    expect(makeKeepPerson(types, "daily", "ปู")("ปู")).toBe(false)
    expect(makeKeepPerson(types, "regular", "ปู")("ปู")).toBe(true)
  })
})
