import { Gauge, Trophy } from "lucide-react"
import { Tabs } from "@/components/ui/Tabs"
import { WorkforcePlanning } from "./WorkforcePlanning"
import { KpiEvaluation } from "./KpiEvaluation"

/** Merged "KPI & Ranking" page — composes the existing 3D ranking (Workforce
 * Planning) and KPI evaluation under one menu, so neither is duplicated. */
export function KpiRanking() {
  return (
    <Tabs
      items={[
        { key: "ranking", label: "Ranking", icon: Trophy, render: () => <WorkforcePlanning /> },
        { key: "kpi", label: "KPI Evaluation", icon: Gauge, render: () => <KpiEvaluation /> },
      ]}
    />
  )
}
