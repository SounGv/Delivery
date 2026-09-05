import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

interface DataSourceStripProps {
  isFetching: boolean
  isError: boolean
  generatedAt: string | null
  sheetLabel: string
  period: string
  teamLabel: string
  onRefresh: () => void
}

/** Report data-source status strip, placed BEFORE the KPI cards per the redesign
 * spec — Google Sheets connection state, which sheet/tab, range, team, and last
 * sync time, all read from the real query state (no fabricated status). */
export function DataSourceStrip({ isFetching, isError, generatedAt, sheetLabel, period, teamLabel, onRefresh }: DataSourceStripProps) {
  return (
    <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 text-xs">
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1.5 font-medium", isError ? "text-destructive" : "text-emerald-glow")}>
          <span className={cn("size-1.5 rounded-full", isError ? "bg-destructive" : "bg-emerald-glow")} />
          {isError ? "Google Sheets: เชื่อมต่อไม่ได้" : "Google Sheets Connected"}
        </span>
        <span>ชีท: {sheetLabel}</span>
        <span>ช่วง: {period}</span>
        <span>ทีม/กะ: {teamLabel}</span>
        <span>Sync ล่าสุด: {generatedAt ? formatDateTime(generatedAt) : "-"}</span>
      </div>
      <Button size="sm" variant="outline" onClick={onRefresh} disabled={isFetching}>
        <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        {isFetching ? "กำลังดึงข้อมูล..." : "ดึงข้อมูลล่าสุด"}
      </Button>
    </div>
  )
}
