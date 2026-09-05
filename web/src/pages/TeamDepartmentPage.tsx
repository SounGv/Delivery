import { useEffect } from "react"
import { Gauge, LayoutDashboard, LineChart, Timer, UserCheck, Users } from "lucide-react"
import { Tabs } from "@/components/ui/Tabs"
import { LiveWarehouse } from "./LiveWarehouse"
import { Employees } from "./Employees"
import { Attendance } from "./Attendance"
import { WorkforcePlanning } from "./WorkforcePlanning"
import { KpiEvaluation } from "./KpiEvaluation"
import { Productivity } from "./Productivity"
import { OtHr } from "./OtHr"
import { useSettings } from "@/lib/settingsContext"
import { TEAM_LABELS } from "@/lib/dashboard-selectors"
import type { TeamId } from "@/api/types"

/**
 * A "department" landing page — locks the app's team scope to `team` (the same
 * `selectedTeam` the old header toggle used to set) and gathers everything
 * about that crew into tabs, reusing the existing pages/logic unchanged.
 * Only the active tab is mounted (via `Tabs`), so this is no heavier than
 * visiting each page separately. Attendance/OT&HR don't read `selectedTeam`
 * (they have their own cross-team department dropdown), so they're given a
 * matching `defaultDepartment` instead.
 */
function TeamDepartmentPage({ team }: { team: TeamId }) {
  const { selectedTeam, setSelectedTeam } = useSettings()
  const deptLabel = TEAM_LABELS[team]

  useEffect(() => {
    if (selectedTeam !== team) setSelectedTeam(team)
  }, [team, selectedTeam, setSelectedTeam])

  return (
    <Tabs
      items={[
        { key: "live", label: "ภาพรวม", icon: LayoutDashboard, render: () => <LiveWarehouse /> },
        { key: "employees", label: "พนักงาน", icon: Users, render: () => <Employees /> },
        { key: "attendance", label: "เข้า-ออกงาน", icon: UserCheck, render: () => <Attendance defaultDepartment={deptLabel} /> },
        { key: "ranking", label: "ผลงาน", icon: Gauge, render: () => <WorkforcePlanning /> },
        { key: "kpi", label: "KPI", icon: Gauge, render: () => <KpiEvaluation /> },
        { key: "productivity", label: "Productivity", icon: LineChart, render: () => <Productivity /> },
        { key: "ot", label: "OT & HR", icon: Timer, render: () => <OtHr defaultDepartment={deptLabel} /> },
      ]}
    />
  )
}

export function OnlineTeamPage() {
  return <TeamDepartmentPage team="online" />
}

export function OfflineTeamPage() {
  return <TeamDepartmentPage team="offline" />
}
