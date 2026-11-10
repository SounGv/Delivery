import { useMemo } from "react"
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query"
import { fetchDashboard, fetchPayloadPart } from "./client"
import { getRefreshIntervalMs, getSlowRefreshIntervalMs } from "@/lib/settingsStorage"
import { useSettings } from "@/lib/settingsContext"
import { computeTeamTotalsByDate, employeesForTeam, latestOutputDate } from "@/lib/dashboard-selectors"
import type {
  CancelledPart,
  DashboardResponse,
  Employee,
  FocusPart,
  RefundsPart,
  RestockPart,
  StockValuePart,
  WorkPerformancePart,
} from "./types"

export function useDashboardQuery() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => fetchDashboard(signal),
    placeholderData: keepPreviousData,
    refetchInterval: getRefreshIntervalMs(),
  })
}

// The heavy payload slices. Each is its own query so a page that doesn't show it
// never downloads it, and it is fetched once and shared between components.
export function useWorkPerformanceQuery() {
  return useQuery({
    queryKey: ["workPerformance"],
    queryFn: ({ signal }) => fetchPayloadPart<WorkPerformancePart>("workPerformance", signal),
    placeholderData: keepPreviousData,
    refetchInterval: getRefreshIntervalMs(),
  })
}

export function useRefundsQuery() {
  return useQuery({
    queryKey: ["refunds"],
    queryFn: ({ signal }) => fetchPayloadPart<RefundsPart>("refunds", signal),
    placeholderData: keepPreviousData,
    refetchInterval: getRefreshIntervalMs(),
  })
}

export function useRestockQuery() {
  return useQuery({
    queryKey: ["restock"],
    queryFn: ({ signal }) => fetchPayloadPart<RestockPart>("restock", signal),
    placeholderData: keepPreviousData,
    refetchInterval: getRefreshIntervalMs(),
  })
}

export function useFocusQuery() {
  return useQuery({
    queryKey: ["focus"],
    queryFn: ({ signal }) => fetchPayloadPart<FocusPart>("focus", signal),
    placeholderData: keepPreviousData,
    refetchInterval: getRefreshIntervalMs(),
  })
}

export function useCancelledQuery() {
  return useQuery({
    queryKey: ["cancelled"],
    queryFn: ({ signal }) => fetchPayloadPart<CancelledPart>("cancelled", signal),
    placeholderData: keepPreviousData,
    refetchInterval: getRefreshIntervalMs(),
  })
}

export function useStockValueQuery() {
  return useQuery({
    queryKey: ["stockValue"],
    queryFn: ({ signal }) => fetchPayloadPart<StockValuePart>("stockValue", signal),
    placeholderData: keepPreviousData,
    refetchInterval: getSlowRefreshIntervalMs(),
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
  const { selectedTeam, targetOverride } = useSettings()
  const raw = query.data

  const data = useMemo<ScopedDashboard | undefined>(() => {
    if (!raw) return undefined
    const employees = employeesForTeam(raw.employees, selectedTeam)
    const teamTotalsByDate = computeTeamTotalsByDate(employees, raw.dates)
    // "Today" for this crew: its own latest day with output (see latestOutputDate), not the all-crew one.
    const todayDate = latestOutputDate(employees) ?? raw.todayDate
    const monthKey = todayDate.slice(0, 7)
    const monthlyTotals = raw.dates.reduce(
      (acc, d) => {
        const t = teamTotalsByDate[d]
        if (!t || !d.startsWith(monthKey)) return acc
        return { parcels: acc.parcels + t.parcels, items: acc.items + t.items }
      },
      { parcels: 0, items: 0 }
    )
    const teamTarget = raw.targetsByTeam?.[selectedTeam] ?? (selectedTeam === "online" ? raw.target : null)
    // A "Target KPI" override in Settings wins over the sheet's target and applies
    // everywhere at once, since every page reads its target from data.target — no
    // page needs to know about the setting individually.
    const target =
      targetOverride != null
        ? { label: `เป้ากำหนดเอง: ${targetOverride}`, value: targetOverride }
        : teamTarget
    return { ...raw, todayDate, employees, allEmployees: raw.employees, teamTotalsByDate, monthlyTotals, target }
  }, [raw, selectedTeam, targetOverride])

  return { ...query, data } as UseTeamDashboardResult
}
