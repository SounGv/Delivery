import { useMemo } from "react"
import { ArrowRightLeft } from "lucide-react"
import {
  computeChannelComparison,
  monthlyChannelComparison,
  type OrderReportTotals,
} from "@/lib/order-report-selectors"
import { formatMonthLabel } from "@/lib/format"
import type { OrderReportDay } from "@/api/types"

const money = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`

function Row({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "rose" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-2 text-base">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          tone === "emerald"
            ? "font-semibold tabular-nums text-emerald-glow"
            : tone === "rose"
              ? "font-semibold tabular-nums text-destructive"
              : tone === "muted"
                ? "tabular-nums text-muted-foreground"
                : "font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  )
}

function ChannelColumn({ label, totals }: { label: string; totals: OrderReportTotals }) {
  const net = totals.totalEffSales - totals.totalRefundAmount
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <p className="mb-2.5 text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="space-y-2">
        <Row label="ยอดขาย" value={money(totals.totalEffSales)} />
        <Row label="ยอดคืนเงิน" value={money(totals.totalRefundAmount)} tone="rose" />
        <Row label="ยอดขายสุทธิ" value={money(net)} tone="emerald" />
        <Row label="ออเดอร์" value={`${totals.totalEffOrders.toLocaleString("th-TH")} ออเดอร์`} />
        <Row label="AOV" value={`฿${totals.weightedAov.toFixed(2)}`} />
        <Row
          label="ยกเลิก"
          value={`${totals.totalCancelledOrders.toLocaleString("th-TH")} ออเดอร์ (${money(totals.totalCancelledAmount)})`}
          tone="rose"
        />
      </div>
    </div>
  )
}

/** Always shows BOTH channels together, independent of whatever single-channel
 * filter the rest of the ยอดขาย page is using — for comparing online vs
 * offline side by side, by day (via daysInRange the caller already filters)
 * and by month (below). */
export function ChannelComparisonPanel({ days }: { days: OrderReportDay[] }) {
  const comparison = useMemo(() => computeChannelComparison(days), [days])
  const monthly = useMemo(() => monthlyChannelComparison(days), [days])

  return (
    <div className="glass-panel rounded-2xl p-4">
      <h3 className="mb-1.5 flex items-center gap-2 text-lg font-semibold text-foreground">
        <ArrowRightLeft className="size-5" /> เทียบยอดขาย ออนไลน์ vs ออฟไลน์
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">ตามช่วงวันที่ที่เลือกด้านบน ไม่ขึ้นกับตัวกรองช่องทาง</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChannelColumn label="ออนไลน์" totals={comparison.online} />
        <ChannelColumn label="ออฟไลน์" totals={comparison.offline} />
      </div>

      {monthly.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-base">
            <thead>
              <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <th></th>
                <th colSpan={3} className="border-b border-border pb-2 pl-3 text-center">
                  ออนไลน์
                </th>
                <th colSpan={3} className="border-b border-border pb-2 pl-3 text-center">
                  ออฟไลน์
                </th>
              </tr>
              <tr className="border-b border-border text-sm text-muted-foreground">
                <th className="pb-2.5 font-medium">เดือน</th>
                <th className="border-l border-border/60 pb-2.5 pl-3 text-right font-medium">ยอดขาย</th>
                <th className="pb-2.5 text-right font-medium">คืนเงิน</th>
                <th className="pb-2.5 text-right font-medium">สุทธิ</th>
                <th className="border-l border-border/60 pb-2.5 pl-3 text-right font-medium">ยอดขาย</th>
                <th className="pb-2.5 text-right font-medium">คืนเงิน</th>
                <th className="pb-2.5 text-right font-medium">สุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {[...monthly].reverse().map((m) => (
                <tr key={m.monthKey} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 text-foreground">{formatMonthLabel(m.monthKey)}</td>
                  <td className="border-l border-border/60 py-2.5 pl-3 text-right tabular-nums">{money(m.onlineSales)}</td>
                  <td className="py-2.5 text-right tabular-nums text-destructive">{money(m.onlineRefund)}</td>
                  <td className="py-2.5 text-right tabular-nums text-emerald-glow">{money(m.onlineNet)}</td>
                  <td className="border-l border-border/60 py-2.5 pl-3 text-right tabular-nums">{money(m.offlineSales)}</td>
                  <td className="py-2.5 text-right tabular-nums text-destructive">{money(m.offlineRefund)}</td>
                  <td className="py-2.5 text-right tabular-nums text-emerald-glow">{money(m.offlineNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
