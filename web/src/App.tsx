import { useEffect, useState } from "react"
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
import { ReceivingWarehouse } from "@/pages/ReceivingWarehouse"
import { SalesSummary } from "@/pages/SalesSummary"
import { WorkIssues } from "@/pages/WorkIssues"
import { PayrollPage } from "@/pages/DataPendingPage"
import { ClaimsAdmin } from "@/pages/ClaimsAdmin"
import { ClaimRegister } from "@/pages/ClaimRegister"
import { useDashboardQuery } from "@/api/queries"
import { formatDateTime } from "@/lib/format"
import { isPublicPage, navigateHash, readHashPage } from "@/lib/hashRoute"

// Canonical routes match the sidebar. Legacy keys are aliased to
// their merged home so any old bookmark/deep-link still resolves (no 404).
const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  live: LiveWarehouse,
  employees: Employees,
  "work-attendance": Attendance,
  "kpi-ranking": KpiRanking,
  analytics: Analytics,
  productivity: Productivity,
  "receiving-warehouse": ReceivingWarehouse,
  "sales-summary": SalesSummary,
  "work-issues": WorkIssues,
  claims: ClaimsAdmin,
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

function StaffApp({
  page,
  onNavigate,
}: {
  page: string
  onNavigate: (key: string) => void
}) {
  const { data, isFetching, isError, refetch } = useDashboardQuery()
  const PageComponent = PAGES[page] ?? Dashboard

  return (
    <AppShell
      isConnected={!isError}
      isFetching={isFetching}
      lastUpdated={data ? formatDateTime(data.generatedAt) : null}
      onRefresh={() => refetch()}
      activePage={page}
      onNavigate={onNavigate}
    >
      <PageComponent />
    </AppShell>
  )
}

function App() {
  const [page, setPage] = useState(readHashPage)

  useEffect(() => {
    const onHash = () => setPage(readHashPage())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = (key: string) => {
    navigateHash(key)
    setPage(key)
  }

  if (isPublicPage(page)) {
    return <ClaimRegister />
  }

  return <StaffApp page={page} onNavigate={navigate} />
}

export default App
