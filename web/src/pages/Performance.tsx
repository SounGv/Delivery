import { Gauge, LineChart, Trophy } from "lucide-react"
import { Tabs } from "@/components/ui/Tabs"
import { WorkforcePlanning } from "./WorkforcePlanning"
import { KpiEvaluation } from "./KpiEvaluation"
import { Analytics } from "./Analytics"

/** Merged "Performance" page — Ranking, KPI Evaluation, and Analytics/Trends
 * under one menu item so none of them get a duplicate sidebar entry. */
export function Performance() {
  return (
    <Tabs
      items={[
        { key: "ranking", label: "Ranking", icon: Trophy, render: () => <WorkforcePlanning /> },
        { key: "kpi", label: "KPI Evaluation", icon: Gauge, render: () => <KpiEvaluation /> },
        { key: "analytics", label: "Analytics", icon: LineChart, render: () => <Analytics /> },
      ]}
    />
  )
}
