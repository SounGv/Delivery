import { useState } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { Dashboard } from "@/pages/Dashboard"
import { Employees } from "@/pages/Employees"
import { LiveWarehouse } from "@/pages/LiveWarehouse"
import { Analytics } from "@/pages/Analytics"
import { Settings } from "@/pages/Settings"
import { Attendance } from "@/pages/Attendance"
import { Performance } from "@/pages/Performance"
import { Productivity } from "@/pages/Productivity"
import { OtHr } from "@/pages/OtHr"
import { ReceivingWarehouse } from "@/pages/ReceivingWarehouse"
import { SalesSummary } from "@/pages/SalesSummary"
import { WorkIssues } from "@/pages/WorkIssues"
import { OnlineTeamPage, OfflineTeamPage } from "@/pages/TeamDepartmentPage"
import { useDashboardQuery } from "@/api/queries"
import { formatDateTime } from "@/lib/format"
import { EmployeeDetailProvider } from "@/lib/employeeDetailStore"
import { EmployeeDetailDrawer } from "@/components/employees/EmployeeDetailDrawer"

// Canonical routes match the sidebar exactly (nav is now organized BY DEPARTMENT —
// see Sidebar.tsx). "team-online"/"team-offline" gather Live/Employees/Attendance/
// Performance/Productivity/OT under tabs for that crew (TeamDepartmentPage.tsx),
// reusing the exact same page components the old function-based menu pointed at.
// Legacy keys are aliased to their original standalone page so any old
// bookmark/deep-link still resolves (no 404) even though they're no longer
// directly in the sidebar. NOTE: "payroll" is intentionally absent — Payroll
// Summary has no real data source and was removed per the redesign spec.
const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  "receiving-warehouse": ReceivingWarehouse,
  "team-online": OnlineTeamPage,
  "team-offline": OfflineTeamPage,
  "sales-summary": SalesSummary,
  "work-issues": WorkIssues,
  settings: Settings,
  // legacy aliases -> original standalone pages (no longer in the main nav)
  live: LiveWarehouse,
  employees: Employees,
  attendance: Attendance,
  "work-attendance": Attendance,
  schedule: Attendance,
  performance: Performance,
  "kpi-ranking": Performance,
  workforce: Performance,
  kpi: Performance,
  analytics: Analytics,
  productivity: Productivity,
  reports: Productivity,
  errors: Productivity,
  "ot-hr": OtHr,
  ot: OtHr,
  "ot-report": OtHr,
}

function App() {
  const { data, isFetching, isError, refetch } = useDashboardQuery()
  const [page, setPage] = useState("dashboard")

  const PageComponent = PAGES[page] ?? Dashboard

  return (
    <EmployeeDetailProvider>
      <AppShell
        isConnected={!isError}
        isFetching={isFetching}
        lastUpdated={data ? formatDateTime(data.generatedAt) : null}
        onRefresh={() => refetch()}
        activePage={page}
        onNavigate={setPage}
      >
        <PageComponent />
      </AppShell>
      <EmployeeDetailDrawer />
    </EmployeeDetailProvider>
  )
}

export default App
