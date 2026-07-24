import { useState } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { Dashboard } from "@/pages/Dashboard"
import { Employees } from "@/pages/Employees"
import { LiveWarehouse } from "@/pages/LiveWarehouse"
import { Analytics } from "@/pages/Analytics"
import { Settings } from "@/pages/Settings"
import { Attendance } from "@/pages/Attendance"
import { KpiRanking } from "@/pages/KpiRanking"
import { Productivity } from "@/pages/Productivity"
import { OtHr } from "@/pages/OtHr"
import { PayrollPage } from "@/pages/DataPendingPage"
import { useDashboardQuery } from "@/api/queries"
import { formatDateTime } from "@/lib/format"

// The 9 canonical routes match the sidebar exactly. Legacy keys are aliased to
// their merged home so any old bookmark/deep-link still resolves (no 404).
const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  live: LiveWarehouse,
  employees: Employees,
  "work-attendance": Attendance,
  "kpi-ranking": KpiRanking,
  analytics: Analytics,
  productivity: Productivity,
  "ot-hr": OtHr,
  payroll: PayrollPage,
  settings: Settings,
  // legacy aliases -> merged pages
  attendance: Attendance,
  schedule: Attendance,
  workforce: KpiRanking,
  kpi: KpiRanking,
  reports: Productivity,
  errors: Productivity,
  ot: OtHr,
  "ot-report": OtHr,
}

function App() {
  const { data, isFetching, isError, refetch } = useDashboardQuery()
  const [page, setPage] = useState("dashboard")

  const PageComponent = PAGES[page] ?? Dashboard

  return (
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
  )
}

export default App
