import { motion } from "framer-motion"
import type { DashboardResponse } from "@/api/types"

/**
 * Renders `data.categories` entries titled "... (รายคน)" — per-person WORKLOAD
 * counts (e.g. CN cases handled that day), deliberately kept out of
 * CategoryStatusPanel's red/green "should be zero" grid since a high number
 * here is neutral-to-good, not an incident.
 */
export function EmployeeWorkloadPanel({ data }: { data: DashboardResponse }) {
  const workloadCategories = data.categories.filter((c) => c.title.includes("(รายคน)"))
  if (workloadCategories.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-panel rounded-2xl p-4 shadow-xl shadow-black/10"
    >
      <div className="space-y-4">
        {workloadCategories.map((category) => (
          <div key={category.id}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {category.title.replace(" (รายคน)", "")} — ภาระงานรายคน
            </p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              ข้อมูลล่าสุด ({data.todayDate}) — ตัวเลขคือปริมาณงานที่ทำ ไม่ใช่ตัวชี้วัดที่ต้องเป็น 0
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {category.rows.map((row) => (
                <div key={row.label} className="glass-panel flex flex-col gap-0.5 rounded-xl border border-border px-3 py-2">
                  <p className="truncate text-xs font-medium text-foreground">{row.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {row.byDate[data.todayDate] ?? "ไม่มีข้อมูลวันนี้"}
                  </p>
                </div>
              ))}
              {category.rows.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีข้อมูลในหมวดนี้</p>}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
