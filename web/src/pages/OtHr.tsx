import { FileClock, Timer } from "lucide-react"
import { Tabs } from "@/components/ui/Tabs"
import { OtManagement } from "./OtManagement"
import { OtReport } from "./OtReport"

/** Merged "OT & HR" page — OT records/management + OT report/charts under one
 * menu, so OT Management and OT Report are not duplicate main-menu entries.
 * `defaultDepartment` forwards through to both when this page is embedded as
 * a tab inside a team's department page. */
export function OtHr({ defaultDepartment }: { defaultDepartment?: string } = {}) {
  return (
    <Tabs
      items={[
        { key: "manage", label: "OT & เวลาทำงาน", icon: Timer, render: () => <OtManagement defaultDepartment={defaultDepartment} /> },
        { key: "report", label: "รายงาน OT", icon: FileClock, render: () => <OtReport defaultDepartment={defaultDepartment} /> },
      ]}
    />
  )
}
