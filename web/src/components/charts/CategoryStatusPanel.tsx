import { motion } from "framer-motion"
import { CheckCircle2, AlertCircle } from "lucide-react"
import type { DashboardResponse } from "@/api/types"
import { parseLeadingNumber } from "@/lib/dashboard-selectors"
import { cn } from "@/lib/utils"

function firstNumber(text: string | undefined): number {
  if (!text) return 0
  return parseLeadingNumber(text) ?? 0
}

export function CategoryStatusPanel({ data }: { data: DashboardResponse }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-panel rounded-2xl p-4 shadow-xl shadow-black/10"
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Category Compliance</h3>
        <p className="text-xs text-muted-foreground">สถานะล่าสุด ({data.todayDate}) ต่อหมวด — ส่วนใหญ่ค่าควรเป็น 0</p>
      </div>

      <div className="space-y-4">
        {data.categories.map((category) => (
          <div key={category.id}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {category.id}. {category.title}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {category.rows.map((row, idx) => {
                const text = row.byDate[data.todayDate]
                const value = firstNumber(text)
                const ok = value === 0
                return (
                  <div
                    key={`${row.label}-${idx}`}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border px-3 py-2",
                      ok ? "border-emerald-glow/20 bg-emerald-glow/5" : "border-destructive/30 bg-destructive/10"
                    )}
                  >
                    {ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-glow" />
                    ) : (
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{row.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{text ?? "ไม่มีข้อมูล"}</p>
                    </div>
                  </div>
                )
              })}
              {category.rows.length === 0 && (
                <p className="text-xs text-muted-foreground">ไม่มีข้อมูลในหมวดนี้</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
