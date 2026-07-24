import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { TeamId } from "@/api/types"

interface SettingsState {
  /** Which crew the production/ranking views focus on. */
  selectedTeam: TeamId
  targetOverride: number | null
  logoDataUrl: string | null
  /** Normal shift start hour (24h) — arrivals before this are not OT. */
  workStartHour: number
  /** Normal shift end hour (24h) — work past this on a work day is OT. */
  workEndHour: number
  /** Lunch break start/end hour (24h) — deducted from worked hours. */
  lunchStartHour: number
  lunchEndHour: number
  /** Department label on the OT form (sheet has no per-person department). */
  department: string
  companyName: string
  /** Daily parcel target at full normal hours — used to derive a per-hour and
   * dynamic (pro-rated to actual worked hours) target. */
  dailyTarget: number
  /** Time-based features (worked hours, OT, per-hour productivity) only read
   * data from this ISO date onward — earlier dates have no check-in/out. */
  attendanceStartDate: string
}

interface SettingsContextValue extends SettingsState {
  setSelectedTeam: (v: TeamId) => void
  setTargetOverride: (v: number | null) => void
  setLogoDataUrl: (v: string | null) => void
  setWorkStartHour: (v: number) => void
  setWorkEndHour: (v: number) => void
  setLunchStartHour: (v: number) => void
  setLunchEndHour: (v: number) => void
  setDepartment: (v: string) => void
  setCompanyName: (v: string) => void
  setDailyTarget: (v: number) => void
  setAttendanceStartDate: (v: string) => void
}

const STORAGE_KEY = "settings:app"

const DEFAULTS: SettingsState = {
  selectedTeam: "online",
  targetOverride: null,
  logoDataUrl: null,
  workStartHour: 9,
  workEndHour: 18,
  lunchStartHour: 12,
  lunchEndHour: 13,
  department: "คลังสินค้า",
  companyName: "ทีมคลังสินค้า",
  dailyTarget: 350,
  attendanceStartDate: "2026-07-01",
}

/** The old default cutoff hid check-in data recorded 2026-07-01..07-19 once the
 * sheet started logging times from the 1st. Migrate that stale saved value to the
 * new default so existing browsers show the full month without manual action. */
const LEGACY_ATTENDANCE_START = "2026-07-20"

function loadInitial(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const merged = { ...DEFAULTS, ...JSON.parse(raw) }
      if (merged.attendanceStartDate === LEGACY_ATTENDANCE_START) {
        merged.attendanceStartDate = DEFAULTS.attendanceStartDate
      }
      return merged
    }
  } catch {
    // ignore malformed storage
  }
  return { ...DEFAULTS }
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SettingsState>(loadInitial)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const setSelectedTeam = (v: TeamId) => setState((s) => ({ ...s, selectedTeam: v }))
  const setTargetOverride = (v: number | null) => setState((s) => ({ ...s, targetOverride: v }))
  const setLogoDataUrl = (v: string | null) => setState((s) => ({ ...s, logoDataUrl: v }))
  const setWorkStartHour = (v: number) => setState((s) => ({ ...s, workStartHour: v }))
  const setWorkEndHour = (v: number) => setState((s) => ({ ...s, workEndHour: v }))
  const setLunchStartHour = (v: number) => setState((s) => ({ ...s, lunchStartHour: v }))
  const setLunchEndHour = (v: number) => setState((s) => ({ ...s, lunchEndHour: v }))
  const setDepartment = (v: string) => setState((s) => ({ ...s, department: v }))
  const setCompanyName = (v: string) => setState((s) => ({ ...s, companyName: v }))
  const setDailyTarget = (v: number) => setState((s) => ({ ...s, dailyTarget: v }))
  const setAttendanceStartDate = (v: string) => setState((s) => ({ ...s, attendanceStartDate: v }))

  return (
    <SettingsContext.Provider
      value={{
        ...state,
        setSelectedTeam,
        setTargetOverride,
        setLogoDataUrl,
        setWorkStartHour,
        setWorkEndHour,
        setLunchStartHour,
        setLunchEndHour,
        setDepartment,
        setCompanyName,
        setDailyTarget,
        setAttendanceStartDate,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider")
  return ctx
}

/** OT config derived from settings, in the shape lib/ot.ts expects. */
export function useOtConfig() {
  const { workStartHour, workEndHour, lunchStartHour, lunchEndHour, department, dailyTarget, attendanceStartDate } =
    useSettings()
  return { workStartHour, workEndHour, lunchStartHour, lunchEndHour, department, dailyTarget, attendanceStartDate }
}
