import { AlertTriangle, LayoutList, LineChart } from "lucide-react"
import { Tabs } from "@/components/ui/Tabs"
import { Reports } from "./Reports"
import { Errors } from "./Errors"
import { ShipErrorsReport } from "./ShipErrorsReport"

/** Merged "Productivity" page — ผลงาน (productivity report) + ข้อผิดพลาดหลังส่ง
 * (detailed post-shipment errors from the error sheet) + สรุป (monthly incident
 * summary). Errors live here as tabs, not as separate main-menu entries. */
export function Productivity() {
  return (
    <Tabs
      items={[
        { key: "output", label: "รายงานพัสดุ (รายวัน/เดือน)", icon: LineChart, render: () => <Reports /> },
        { key: "errors", label: "ข้อผิดพลาดหลังส่ง", icon: AlertTriangle, render: () => <ShipErrorsReport /> },
        { key: "summary", label: "สรุปข้อผิดพลาด", icon: LayoutList, render: () => <Errors /> },
      ]}
    />
  )
}
