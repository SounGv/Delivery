import { useCallback, useMemo, useState, type ReactNode } from "react"
import { useDashboardQuery, useMealsQuery } from "@/api/queries"
import {
  PeopleFilterContext,
  buildPersonTypes,
  canonicalName,
  makeKeepPerson,
  type PeopleFilterValue,
  type TypeFilter,
} from "@/lib/people-type"

const RECENT_DAYS = 45

/** Holds the person filter of the top bar. The state lives here (above every page) so each page reads the same choice;
 * the scoped dashboard hooks in api/queries.ts apply it to the staff data. Kept in memory only: a stale choice
 * restored on the next visit would silently hide people. */
export function PeopleFilterProvider({ children }: { children: ReactNode }) {
  const meals = useMealsQuery().data?.meals
  const dashboard = useDashboardQuery().data
  const [type, setTypeState] = useState<TypeFilter>("all")
  const [staff, setStaff] = useState("")

  const types = useMemo(() => buildPersonTypes(meals), [meals])

  const names = useMemo(() => {
    const set = new Set<string>(types.keys())
    if (dashboard) {
      const recent = dashboard.dates.filter((d) => d <= dashboard.todayDate).slice(-RECENT_DAYS)
      for (const e of dashboard.employees) {
        const worked = recent.some((d) => {
          const cell = e.byDate[d]
          return !!cell && !!(cell.parcels || cell.items || cell.checkIn)
        })
        if (worked) set.add(canonicalName(e.name))
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "th"))
  }, [types, dashboard])

  // Choosing a type drops the chosen person when they are of another type, so the two choices never contradict.
  const setType = useCallback(
    (t: TypeFilter) => {
      setTypeState(t)
      setStaff((s) => (!s || t === "all" || types.get(canonicalName(s)) === t ? s : ""))
    },
    [types]
  )
  const choosePerson = useCallback((name: string) => setStaff(name ? canonicalName(name) : ""), [])

  const keep = useMemo(() => makeKeepPerson(types, type, staff), [types, type, staff])

  const value = useMemo<PeopleFilterValue>(
    () => ({ type, staff, setType, setStaff: choosePerson, typesReady: types.size > 0, types, names, keep, active: type !== "all" || staff !== "" }),
    [type, staff, setType, choosePerson, types, names, keep]
  )
  return <PeopleFilterContext.Provider value={value}>{children}</PeopleFilterContext.Provider>
}
