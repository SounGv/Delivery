import { lazy, Suspense, useMemo } from "react"
import { Wallet, ShoppingCart, Receipt, XCircle, RotateCcw, TicketPercent, TrendingUp, AlertTriangle, CalendarDays } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { formatFullDateLabel } from "@/lib/format"
import {
  sortedOrderReportDays,
  computeOrderReportTotals,
  topBottomDays,
  peakDay,
  weekdayAverages,
  WEEKDAY_LABELS_TH_FULL,
} from "@/lib/order-report-selectors"
import type { OrderReportDay } from "@/api/types"

const SalesTrendChart = lazy(() => import("@/components/charts/SalesTrendChart").then((m) => ({ default: m.SalesTrendChart })))
const SalesWeekdayChart = lazy(() => import("@/components/charts/SalesWeekdayChart").then((m) => ({ default: m.SalesWeekdayChart })))
const SalesWeeklyChart = lazy(() => import("@/components/charts/SalesWeeklyChart").then((m) => ({ default: m.SalesWeeklyChart })))
const CancelRefundRateChart = lazy(() =>
  import("@/components/charts/CancelRefundRateChart").then((m) => ({ default: m.CancelRefundRateChart }))
)

function ChartFallback({ height = 300 }: { height?: number }) {
  return <Skeleton className="rounded-2xl" style={{ height }} />
}

const money = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`

function DayTable({ title, rows, tone }: { title: string; rows: OrderReportDay[]; tone: "top" | "bottom" }) {
  return (
    <div className="glass-panel overflow-x-auto rounded-2xl p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="pb-2 font-medium">วันที่</th>
            <th className="pb-2 font-medium text-right">ยอดขาย (฿)</th>
            <th className="pb-2 font-medium text-right">ออเดอร์</th>
            <th className="pb-2 font-medium text-right">AOV (฿)</th>
            <th className="pb-2 font-medium text-right">อัตรายกเลิก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const cancelRate = d.totalOrders > 0 ? (d.cancelledOrders / d.totalOrders) * 100 : 0
            const highlight = tone === "top" ? i === 0 : i < 3
            return (
              <tr key={d.date} className="border-b border-white/5 last:border-0">
                <td className={highlight ? (tone === "top" ? "py-2 font-semibold text-emerald-glow" : "py-2 font-semibold text-destructive") : "py-2 text-foreground"}>
                  {formatFullDateLabel(d.date)}
                </td>
                <td className="py-2 text-right tabular-nums">{d.effSales.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{d.effOrders.toLocaleString("th-TH")}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{d.aov.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{cancelRate.toFixed(1)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function SalesSummary() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const report = data?.orderReport ?? null

  const days = useMemo(() => (report ? sortedOrderReportDays(report.days) : []), [report])
  const totals = useMemo(() => computeOrderReportTotals(days), [days])
  const { top, bottom } = useMemo(() => topBottomDays(days, 5), [days])
  const peak = useMemo(() => peakDay(days), [days])
  const averages = useMemo(() => weekdayAverages(days), [days])
  const bestWdIdx = averages.indexOf(Math.max(...averages))
  const worstWdIdx = averages.indexOf(Math.min(...averages))

  if (isLoading) return <LoadingSkeletonGrid count={8} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  if (!report || days.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
        ยังไม่มีข้อมูลสรุปยอดขาย — ตรวจว่าได้ redeploy Apps Script (เวอร์ชันที่อ่านแท็บ "รายงานคำสั่งซื้อ") แล้วหรือยัง
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <CalendarDays className="size-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          สรุปยอดขาย BigSeller · {formatFullDateLabel(days[0]?.date ?? "")} &ndash; {formatFullDateLabel(days[days.length - 1]?.date ?? "")} ({days.length} วัน)
          จากแท็บ "รายงานคำสั่งซื้อ"
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="ยอดขายรวม (มีผล)"
          value={totals.totalEffSales}
          icon={Wallet}
          gradient="bg-gradient-to-br from-brand-600 to-brand-700"
          formatValue={(n) => `฿${Math.round(n).toLocaleString("th-TH")}`}
          subtitle={`เฉลี่ย ${money(totals.totalEffSales / (totals.nDays || 1))}/วัน`}
        />
        <KpiCard
          title="คำสั่งซื้อที่มีผล"
          value={totals.totalEffOrders}
          icon={ShoppingCart}
          gradient="bg-gradient-to-br from-emerald-glow to-brand-600"
          suffix="ออเดอร์"
          subtitle={`จากทั้งหมด ${totals.totalOrders.toLocaleString("th-TH")} ออเดอร์`}
        />
        <KpiCard
          title="AOV เฉลี่ย"
          value={totals.weightedAov}
          icon={Receipt}
          gradient="bg-gradient-to-br from-violet-500 to-brand-600"
          formatValue={(n) => `฿${n.toFixed(2)}`}
          subtitle="ต่อคำสั่งซื้อ 1 รายการ"
        />
        <KpiCard
          title="อัตรายกเลิกรวม"
          value={totals.cancelRate}
          icon={XCircle}
          gradient="bg-gradient-to-br from-rose-500 to-destructive"
          formatValue={(n) => n.toFixed(2)}
          suffix="%"
          subtitle={`${totals.totalCancelledOrders.toLocaleString("th-TH")} ออเดอร์ · ${money(totals.totalCancelledAmount)}`}
        />
        <KpiCard
          title="อัตราคืนเงินเฉลี่ย"
          value={totals.avgRefundRate}
          icon={RotateCcw}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          formatValue={(n) => n.toFixed(2)}
          suffix="%"
          subtitle={`เฉลี่ยต่อวัน (${totals.nDays} วัน)`}
        />
        <KpiCard
          title="ยอดใช้โค้ดส่วนลด"
          value={totals.totalDiscountCode}
          icon={TicketPercent}
          gradient="bg-gradient-to-br from-brand-500 to-brand-700"
          formatValue={(n) => `฿${Math.round(n).toLocaleString("th-TH")}`}
          subtitle={`${((totals.totalDiscountCode / (totals.totalEffSales || 1)) * 100).toFixed(1)}% ของยอดขายรวม`}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7">
          <Suspense fallback={<ChartFallback height={320} />}>
            <SalesTrendChart days={days} />
          </Suspense>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <Suspense fallback={<ChartFallback height={320} />}>
            <SalesWeekdayChart days={days} />
          </Suspense>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <Suspense fallback={<ChartFallback height={300} />}>
            <SalesWeeklyChart days={days} />
          </Suspense>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <Suspense fallback={<ChartFallback height={300} />}>
            <CancelRefundRateChart days={days} />
          </Suspense>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DayTable title="Top 5 วันที่ขายดีที่สุด" rows={top} tone="top" />
        <DayTable title="Bottom 5 วันที่ขายน้อยที่สุด" rows={bottom} tone="bottom" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="glass-panel rounded-2xl p-4">
          <Badge variant="outline" className="mb-2 border-emerald-glow/40 text-emerald-glow">
            <TrendingUp className="mr-1 size-3" /> PEAK DAY
          </Badge>
          <h3 className="mb-1.5 text-sm font-semibold text-foreground">
            {peak ? `${formatFullDateLabel(peak.date)} ทำยอดสูงสุด` : "-"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {peak &&
              `ยอดขาย ${money(peak.effSales)} จาก ${peak.effOrders.toLocaleString("th-TH")} ออเดอร์ (AOV ${money(peak.aov)}) สูงกว่าค่าเฉลี่ยรายวัน (${money(
                totals.totalEffSales / (totals.nDays || 1)
              )}) ${(peak.effSales / (totals.totalEffSales / (totals.nDays || 1))).toFixed(1)} เท่า`}
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <Badge variant="destructive" className="mb-2">
            <AlertTriangle className="mr-1 size-3" /> RISK
          </Badge>
          <h3 className="mb-1.5 text-sm font-semibold text-foreground">เฝ้าระวังวันที่อัตรายกเลิกพุ่งสูง</h3>
          <p className="text-xs text-muted-foreground">
            อัตรายกเลิกเฉลี่ยรวมอยู่ที่ {totals.cancelRate.toFixed(1)}% — ดูตาราง Bottom 5 ด้านบน ถ้าวันขายน้อยตรงกับวันที่อัตรายกเลิกสูงผิดปกติ
            ควรตรวจสต็อก/การชำระเงิน/โลจิสติกส์ของวันนั้นย้อนหลัง
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <Badge variant="secondary" className="mb-2">
            PATTERN
          </Badge>
          <h3 className="mb-1.5 text-sm font-semibold text-foreground">
            วัน{WEEKDAY_LABELS_TH_FULL[bestWdIdx]}ขายดีสุด วัน{WEEKDAY_LABELS_TH_FULL[worstWdIdx]}ขายน้อยสุด
          </h3>
          <p className="text-xs text-muted-foreground">
            ยอดขายเฉลี่ยวัน{WEEKDAY_LABELS_TH_FULL[bestWdIdx]}สูงกว่าวัน{WEEKDAY_LABELS_TH_FULL[worstWdIdx]}ประมาณ{" "}
            {(((averages[bestWdIdx] ?? 0) / (averages[worstWdIdx] || 1) - 1) * 100).toFixed(0)}% — ใช้จัดโปรโมชัน/สต็อกให้สอดคล้องกับพฤติกรรมลูกค้ารายสัปดาห์
          </p>
        </div>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        ที่มาข้อมูล: ชีต "รายงานคำสั่งซื้อ" (BigSeller export) · ข้อจำกัด: ไม่แยกตามช่องทางการขายหรือ SKU, และ AOV คำนวณแบบถ่วงน้ำหนัก (ยอดขายรวม/ออเดอร์รวม)
        ไม่ใช่ค่าเฉลี่ยอย่างง่ายของแต่ละวัน
      </p>
    </div>
  )
}
