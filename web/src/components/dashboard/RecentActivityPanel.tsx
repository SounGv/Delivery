import { motion } from "framer-motion"
import { Clock } from "lucide-react"
import type { DashboardResponse } from "@/api/types"
import { recentDates } from "@/lib/dashboard-selectors"
import { formatDateLabel, formatDateTime, formatNumber } from "@/lib/format"

export function RecentActivityPanel({ data }: { data: DashboardResponse }) {
  const last = recentDates(data.dates, 6)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-panel flex h-full flex-col rounded-2xl p-4 shadow-xl shadow-black/10"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
          <p className="text-xs text-muted-foreground">อัปเดตล่าสุดจากชีทรายวัน</p>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" /> {formatDateTime(data.generatedAt)}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {last.map((date, idx) => {
          const total = data.teamTotalsByDate[date]
          const isLatest = date === data.todayDate
          return (
            <div
              key={date}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                isLatest ? "border-brand-500/30 bg-brand-500/10" : "border-white/5 bg-white/[0.02]"
              }`}
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div>
                <p className="text-xs font-medium text-foreground">{formatDateLabel(date)}</p>
                <p className="text-[11px] text-muted-foreground">{total?.activeEmployees ?? 0} คนทำงาน</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-foreground">{formatNumber(total?.items)} ชิ้น</p>
                <p className="text-[11px] text-muted-foreground">{formatNumber(total?.parcels)} พัสดุ</p>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
