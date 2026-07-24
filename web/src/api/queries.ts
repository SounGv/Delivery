import { useMemo } from "react"
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query"
import { fetchDashboard } from "./client"
import { getRefreshIntervalMs } from "@/lib/settingsStorage"
import { useSettings } from "@/lib/settingsContext"
import { computeTeamTotalsByDate, employeesForTeam } from "@/lib/dashboard-selectors"
import type { DashboardResponse, Employee } from "./types"

export function useDashboardQuery() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => fetchDashboard(signal),
    placeholderData: keepPreviousData,
    refetchInterval: getRefreshIntervalMs(),
  })
}

/** The dashboard payload scoped to the currently selected crew. `data.employees`,
 * `target`, `teamTotalsByDate` and `monthlyTotals` reflect just that team, so every
 * production/ranking view honours the team switcher without page-by-page filtering.
 * The full, unscoped roster is exposed as `allEmployees` for cross-team views. */
export interface ScopedDashboard extends DashboardResponse {
  allEmployees: Employee[]
}

export type UseTeamDashboardResult = Omit<UseQueryResult<DashboardResponse, Error>, "data"> & {
  data: ScopedDashboard | undefined
}

export function useTeamDashboard(): UseTeamDashboardResult {
  const query = useDashboardQuery()
  const { selectedTeam } = useSettings()
  const raw = query.data

  const data = useMemo<ScopedDashboard | undefined>(() => {
    if (!raw) return undefined
    const employees = employeesForTeam(raw.employees, selectedTeam)
    const teamTotalsByDate = computeTeamTotalsByDate(employees, raw.dates)
    const monthKey = raw.todayDate.slice(0, 7)
    const monthlyTotals = raw.dates.reduce(
      (acc, d) => {
        const t = teamTotalsByDate[d]
        if (!t || !d.startsWith(monthKey)) return acc
        return { parcels: acc.parcels + t.parcels, items: acc.items + t.items }
      },
      { parcels: 0, items: 0 }
    )
    const target = raw.targetsByTeam?.[selectedTeam] ?? (selectedTeam === "online" ? raw.target : null)
    return { ...raw, employees, allEmployees: raw.employees, teamTotalsByDate, monthlyTotals, target }
  }, [raw, selectedTeam])

  return { ...query, data } as UseTeamDashboardResult
}
