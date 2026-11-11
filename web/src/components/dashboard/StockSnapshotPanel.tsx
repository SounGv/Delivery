import { AlertTriangle, CheckCircle2, Clock, Truck } from "lucide-react"
import { StatusPill } from "@/components/returns/ReturnsUi"
import { STOCK_DIFF_WARN_PERCENT, STOCK_REFERENCE_STALE_DAYS, type StockSnapshot } from "@/lib/stock-value-selectors"

const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`
const num = (n: number) => n.toLocaleString("th-TH")

/** Stock value on the overview: total, share per warehouse, goods in transit, and how fresh the numbers are. */
export function StockSnapshotPanel({ snapshot }: { snapshot: StockSnapshot }) {
  const stale = snapshot.ageDays !== null && snapshot.ageDays > STOCK_REFERENCE_STALE_DAYS
  return (
    <div className="glass-panel flex h-full flex-col gap-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-muted-foreground">มูลค่าสต็อกรวม {num(snapshot.warehouses.length)} คลัง</p>
          <p className="text-[26px] font-extrabold tabular-nums text-foreground sm:text-4xl">{baht(snapshot.total)}</p>
        </div>
        {snapshot.asOf &&
          (stale ? (
            <StatusPill tone="warn" icon={Clock}>
              ข้อมูล BigSeller เก่า {num(snapshot.ageDays ?? 0)} วัน
            </StatusPill>
          ) : (
            <StatusPill tone="ok" icon={CheckCircle2}>
              ข้อมูล BigSeller {snapshot.ageDays === 0 ? "วันนี้" : `${num(snapshot.ageDays ?? 0)} วันก่อน`}
            </StatusPill>
          ))}
      </div>

      <ul className="space-y-2.5">
        {snapshot.warehouses.map((w) => (
          <li key={w.warehouse}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-semibold text-foreground">{w.warehouse}</span>
              <span className="flex shrink-0 items-center gap-2">
                {w.highDiff && w.diffPercent !== null && (
                  <StatusPill tone="warn" icon={AlertTriangle} small>
                    ต่างจาก BigSeller {w.diffPercent > 0 ? "+" : ""}
                    {w.diffPercent.toFixed(0)}%
                  </StatusPill>
                )}
                <span className="font-bold tabular-nums text-foreground">{baht(w.value)}</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(w.value > 0 ? 2 : 0, w.share)}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center gap-3 rounded-xl bg-muted/60 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300">
          <Truck className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">สินค้าระหว่างทาง (ยังไม่รับเข้า ไม่รวมในยอดด้านบน)</p>
          <p className="font-extrabold tabular-nums text-foreground">
            {baht(snapshot.inTransitCost)}
            <span className="ml-2 text-xs font-semibold text-muted-foreground">
              {num(snapshot.inTransitUnits)} ชิ้น · ไป {num(snapshot.inTransitWarehouses)} คลัง
            </span>
          </p>
        </div>
      </div>
      {snapshot.highDiffCount > 0 && (
        <p className="text-xs text-muted-foreground">
          ป้ายเตือน = มูลค่าในเว็บต่างจากที่ BigSeller คำนวณตั้งแต่ {STOCK_DIFF_WARN_PERCENT}% ขึ้นไป (ส่วนใหญ่เพราะ BigSeller ไม่มีต้นทุนของบาง SKU) — ดูตารางหมายเหตุในหน้ามูลค่าสต็อก
        </p>
      )}
    </div>
  )
}
