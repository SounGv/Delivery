import { createContext, useContext } from "react"
import type { MealsReportData } from "@/api/types"
import { NAME_ALIASES } from "@/lib/meal-claims"

/**
 * Daily-wage versus regular staff, for the filter in the top bar.
 *
 * The sheets have no "type" column. The rule comes from the team: regular staff claim a meal allowance, daily-wage staff
 * are paid OT (60 minutes counts as 1 hour). The tab "เบิกค่าข้าว" keeps one block for each, so a person in the claim block
 * is regular and a person in the late-stay block is daily-wage. People in neither block have no known type.
 */
export type PersonType = "regular" | "daily"
export type TypeFilter = "all" | PersonType

export const TYPE_LABEL: Record<PersonType, string> = { regular: "ประจำ", daily: "รายวัน" }
export const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "regular", label: TYPE_LABEL.regular },
  { key: "daily", label: TYPE_LABEL.daily },
]

/** Types the team told us for people who are in neither block of the tab. Hand-kept: add `name: "regular" | "daily"`.
 * shortcut: hand-kept list; the better home is a "ประเภท" column in the tab "รายชื่อพนักงาน (BigSeller)" read by Apps Script. */
export const TYPE_OVERRIDES: Record<string, PersonType> = {}

/** One spelling per person: the one used in the team output sheet (see NAME_ALIASES). */
export const canonicalName = (name: string): string => NAME_ALIASES[name] ?? name

/** Type of each person (by canonical name) as far as the tab "เบิกค่าข้าว" and TYPE_OVERRIDES tell. */
export function buildPersonTypes(meals: MealsReportData | undefined): Map<string, PersonType> {
  const types = new Map<string, PersonType>()
  if (meals) {
    for (const p of meals.claims) types.set(canonicalName(p.name), "regular")
    for (const p of meals.lateStays) types.set(canonicalName(p.name), "daily")
  }
  for (const [name, type] of Object.entries(TYPE_OVERRIDES)) types.set(canonicalName(name), type)
  return types
}

/** True for the people the filter lets through: the chosen person (if any) and the chosen type (if any). A person whose
 * type is unknown only shows under "ทั้งหมด". */
export function makeKeepPerson(types: Map<string, PersonType>, type: TypeFilter, staff: string): (name: string) => boolean {
  const only = staff ? canonicalName(staff) : ""
  return (name) => {
    const n = canonicalName(name)
    if (only && n !== only) return false
    return type === "all" || types.get(n) === type
  }
}

export interface PeopleFilterValue {
  type: TypeFilter
  /** Canonical name of the chosen person, or "" for everyone. */
  staff: string
  setType: (t: TypeFilter) => void
  setStaff: (name: string) => void
  /** Whether the types are known (the tab "เบิกค่าข้าว" was read). Without it only "ทั้งหมด" works. */
  typesReady: boolean
  types: Map<string, PersonType>
  /** Names offered in the person list (canonical): people with recent work or a type. */
  names: string[]
  keep: (name: string) => boolean
  /** Whether any filter is on. */
  active: boolean
}

const keepEveryone = () => true

/** The default has no filter, so a page rendered without the provider (a test) sees everyone. */
export const PeopleFilterContext = createContext<PeopleFilterValue>({
  type: "all",
  staff: "",
  setType: () => undefined,
  setStaff: () => undefined,
  typesReady: false,
  types: new Map(),
  names: [],
  keep: keepEveryone,
  active: false,
})

export const usePeopleFilter = () => useContext(PeopleFilterContext)
