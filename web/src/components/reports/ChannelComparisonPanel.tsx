import { useMemo } from "react"
import { Monitor, Store, Coins } from "lucide-react"
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
            ? "font-semibold tabular-nums text-emerald-700 dark:text-emerald-300"
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

function ChannelColumn({
  label,
  icon: Icon,
  totals,
  share,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  totals: OrderReportTotals
  share: number
}) {
  const net = totals.totalEffSales - totals.totalRefundAmount
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-background/60 p-4 pl-5">
      <span className="absolute inset-y-0 left-0 w-1.5 bg-primary" aria-hidden />
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-base font-extrabold text-foreground">{label}</p>
        <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{share.toFixed(1)}% ของยอดขาย</span>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Coins className="size-3.5" /> ยอดขายสุทธิ (หลังหักคืนเงิน)
      </p>
      <p className="mb-3 text-[22px] font-extrabold tabular-nums text-emerald-700 sm:text-3xl dark:text-emerald-300">{money(net)}</p>
      <div className="space-y-2">
        <Row label="ยอดขาย" value={money(totals.totalEffSales)} />
        <Row label="ออเดอร์" value={`${totals.totalEffOrders.toLocaleString("th-TH")} ออเดอร์`} />
        <Row label="ยอดเฉลี่ยต่อออเดอร์" value={`฿${totals.weightedAov.toFixed(2)}`} />
        <Row label="ยอดคืนเงิน" value={`− ${money(totals.totalRefundAmount)}`} tone="rose" />
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
  const bothSales = comparison.online.totalEffSales + comparison.offline.totalEffSales
  const onlineShare = bothSales > 0 ? (comparison.online.totalEffSales / bothSales) * 100 : 0

  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>ออนไลน์ {onlineShare.toFixed(1)}%</span>
          <span>ออฟไลน์ {(100 - onlineShare).toFixed(1)}%</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`สัดส่วนยอดขาย ออนไลน์ ${onlineShare.toFixed(1)}% ออฟไลน์ ${(100 - onlineShare).toFixed(1)}%`}>
          <div className="bg-primary" style={{ width: `${onlineShare}%` }} />
          <div className="bg-sky-500" style={{ width: `${100 - onlineShare}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChannelColumn label="ออนไลน์" icon={Monitor} totals={comparison.online} share={onlineShare} />
        <ChannelColumn label="ออฟไลน์" icon={Store} totals={comparison.offline} share={100 - onlineShare} />
      </div>

      {monthly.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="stack-table w-full min-w-[720px] text-left text-base">
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
                  <td className="stack-title py-2.5 text-foreground">{formatMonthLabel(m.monthKey)}</td>
                  <td data-label="ออนไลน์ · ยอดขาย" className="border-l border-border/60 py-2.5 pl-3 text-right tabular-nums">{money(m.onlineSales)}</td>
                  <td data-label="ออนไลน์ · คืนเงิน" className="py-2.5 text-right tabular-nums text-destructive">{money(m.onlineRefund)}</td>
                  <td data-label="ออนไลน์ · สุทธิ" className="py-2.5 text-right tabular-nums text-emerald-glow">{money(m.onlineNet)}</td>
                  <td data-label="ออฟไลน์ · ยอดขาย" className="border-l border-border/60 py-2.5 pl-3 text-right tabular-nums">{money(m.offlineSales)}</td>
                  <td data-label="ออฟไลน์ · คืนเงิน" className="py-2.5 text-right tabular-nums text-destructive">{money(m.offlineRefund)}</td>
                  <td data-label="ออฟไลน์ · สุทธิ" className="py-2.5 text-right tabular-nums text-emerald-glow">{money(m.offlineNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
