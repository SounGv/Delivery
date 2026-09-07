import { lazy, Suspense, useMemo, useState } from "react"
import { Wallet, ShoppingCart, Receipt, Coins, RotateCcw, TicketPercent, TrendingUp, CalendarDays } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { ChannelComparisonPanel } from "@/components/reports/ChannelComparisonPanel"
import { formatFullDateLabel } from "@/lib/format"
import { getDatePresets } from "@/lib/dashboard-selectors"
import {
  sortedOrderReportDays,
  computeOrderReportTotals,
  topBottomDays,
  peakDay,
  weekdayAverages,
  applyChannelFilter,
  CHANNEL_FILTER_LABELS,
  WEEKDAY_LABELS_TH_FULL,
  type ChannelFilter,
  type OrderReportTotals,
} from "@/lib/order-report-selectors"
import type { OrderReportDay } from "@/api/types"

const SalesTrendChart = lazy(() => import("@/components/charts/SalesTrendChart").then((m) => ({ default: m.SalesTrendChart })))
const SalesWeekdayChart = lazy(() => import("@/components/charts/SalesWeekdayChart").then((m) => ({ default: m.SalesWeekdayChart })))
const SalesWeeklyChart = lazy(() => import("@/components/charts/SalesWeeklyChart").then((m) => ({ default: m.SalesWeeklyChart })))
const AovTrendChart = lazy(() => import("@/components/charts/AovTrendChart").then((m) => ({ default: m.AovTrendChart })))

function ChartFallback({ height = 300 }: { height?: number }) {
  return <Skeleton className="rounded-2xl" style={{ height }} />
}

const money = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`

/** Abbreviates values ≥ 1M as "฿12.3M" — the full-digit form (9-figure baht
 * amounts are routine here) overflows a KpiCard's fixed width and gets
 * clipped by its `truncate` class; the exact figure is still one glance away
 * in ExtraStatsPanel/the subtitle line below each card. */
const compactMoney = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(1)}M` : money(n))

function DayTable({ title, rows, tone }: { title: string; rows: OrderReportDay[]; tone: "top" | "bottom" }) {
  return (
    <div className="glass-panel overflow-x-auto rounded-2xl p-4">
      <h3 className="mb-2.5 text-base font-semibold text-foreground">{title}</h3>
      <table className="w-full min-w-[480px] text-left text-base">
        <thead>
          <tr className="border-b border-border text-sm text-muted-foreground">
            <th className="pb-2.5 font-medium">วันที่</th>
            <th className="pb-2.5 font-medium text-right">ยอดขาย (฿)</th>
            <th className="pb-2.5 font-medium text-right">ออเดอร์</th>
            <th className="pb-2.5 font-medium text-right">AOV (฿)</th>
            <th className="pb-2.5 font-medium text-right">อัตรายกเลิก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const cancelRate = d.totalOrders > 0 ? (d.cancelledOrders / d.totalOrders) * 100 : 0
            const highlight = tone === "top" ? i === 0 : i < 3
            return (
              <tr key={d.date} className="border-b border-white/5 last:border-0">
                <td className={highlight ? (tone === "top" ? "py-2.5 font-semibold text-emerald-glow" : "py-2.5 font-semibold text-destructive") : "py-2.5 text-foreground"}>
                  {formatFullDateLabel(d.date)}
                </td>
                <td className="py-2.5 text-right tabular-nums">{d.effSales.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</td>
                <td className="py-2.5 text-right tabular-nums text-muted-foreground">{d.effOrders.toLocaleString("th-TH")}</td>
                <td className="py-2.5 text-right tabular-nums text-muted-foreground">{d.aov.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</td>
                <td className="py-2.5 text-right tabular-nums text-muted-foreground">{cancelRate.toFixed(1)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StatChip({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "rose" }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-base font-semibold tabular-nums ${tone === "emerald" ? "text-emerald-glow" : tone === "rose" ? "text-destructive" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  )
}

function ExtraStatsPanel({ totals }: { totals: OrderReportTotals }) {
  // "ราคาสินค้าเดิม" isn't always logged (e.g. the offline BigSeller export never
  // populates it) — treat 0 as "no data" rather than computing a nonsensical
  // negative discount.
  const hasOrigPriceData = totals.totalOrigPrice > 0
  const discountAmount = hasOrigPriceData ? totals.totalOrigPrice - totals.totalProductSales : 0
  const discountPct = hasOrigPriceData ? (discountAmount / totals.totalOrigPrice) * 100 : 0
  return (
    <div className="glass-panel rounded-2xl p-4">
      <h3 className="mb-1.5 text-base font-semibold text-foreground">รายละเอียดเพิ่มเติมจากชีต</h3>
      <p className="mb-3.5 text-sm text-muted-foreground">ทุกคอลัมน์ในชีตรายงานคำสั่งซื้อ ที่ไม่ได้อยู่ในการ์ด KPI หลักด้านบน</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="จำนวนพัสดุ" value={`${totals.totalParcels.toLocaleString("th-TH")} พัสดุ`} />
        <StatChip label="รายได้รวม" value={money(totals.totalRevenue)} />
        <StatChip label="เงินอุดหนุนจากผู้ขาย" value={money(totals.totalSellerSubsidy)} />
        <StatChip label="ยอดขายสินค้า" value={money(totals.totalProductSales)} />
        <StatChip label="ราคาสินค้าเดิม" value={money(totals.totalOrigPrice)} />
        <StatChip
          label="ส่วนลดสินค้ารวม"
          value={hasOrigPriceData ? `${money(discountAmount)} (${discountPct.toFixed(1)}%)` : "ไม่มีข้อมูล"}
        />
        <StatChip label={`ยอดขาย (col "ยอดขาย")`} value={money(totals.totalSales)} />
        <StatChip label="ยอดคืนเงินรวม" value={money(totals.totalRefundAmount)} tone="rose" />
        <StatChip
          label="คำสั่งซื้อ/ลูกค้าที่คืนเงิน"
          value={`${totals.totalRefundOrders.toLocaleString("th-TH")} / ${totals.totalRefundCustomers.toLocaleString("th-TH")}`}
          tone="rose"
        />
        <StatChip label="มูลค่าคำสั่งซื้อที่ยกเลิก" value={money(totals.totalCancelledAmount)} tone="rose" />
        <StatChip
          label="คำสั่งซื้อที่ยกเลิก"
          value={`${totals.totalCancelledOrders.toLocaleString("th-TH")} ออเดอร์ (${totals.cancelRate.toFixed(1)}%)`}
          tone="rose"
        />
      </div>
    </div>
  )
}

export function SalesSummary() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const report = data?.orderReport ?? null

  const allDays = useMemo(() => (report ? sortedOrderReportDays(report.days) : []), [report])
  const minDate = allDays[0]?.date ?? ""
  const maxDate = allDays[allDays.length - 1]?.date ?? ""
  // allDays holds one row per channel per date, so count distinct dates for display.
  const uniqueDateCount = useMemo(() => new Set(allDays.map((d) => d.date)).size, [allDays])

  // "Today" for this report is the latest day the sheet actually has, not the
  // real calendar date — the BigSeller export can lag behind, and presets like
  // "This month" should reflect data that exists rather than an empty future month.
  const defaultPreset = useMemo(() => {
    const presets = getDatePresets(maxDate || "1970-01-01", minDate || "1970-01-01")
    return presets.find((p) => p.label === "เดือนนี้") ?? { start: minDate, end: maxDate }
  }, [minDate, maxDate])

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [channel, setChannel] = useState<ChannelFilter>("all")
  const effectiveStart = startDate || defaultPreset.start
  const effectiveEnd = endDate || defaultPreset.end

  const daysInRange = useMemo(
    () => allDays.filter((d) => d.date >= effectiveStart && d.date <= effectiveEnd),
    [allDays, effectiveStart, effectiveEnd]
  )
  const days = useMemo(() => applyChannelFilter(daysInRange, channel), [daysInRange, channel])
  const totals = useMemo(() => computeOrderReportTotals(days), [days])
  const { top, bottom } = useMemo(() => topBottomDays(days, 5), [days])
  const peak = useMemo(() => peakDay(days), [days])
  const averages = useMemo(() => weekdayAverages(days), [days])
  const bestWdIdx = averages.indexOf(Math.max(...averages))
  const worstWdIdx = averages.indexOf(Math.min(...averages))
  // A weekday with 0 average (no days of that weekday in range yet) makes the
  // best-vs-worst uplift % meaningless (divides by ~0) — only show it once both
  // sides have real data.
  const bestWdAvg = averages[bestWdIdx] ?? 0
  const worstWdAvg = averages[worstWdIdx] ?? 0
  const hasWeekdayComparison = bestWdAvg > 0 && worstWdAvg > 0
  const weekdayUpliftPct = hasWeekdayComparison ? (bestWdAvg / worstWdAvg - 1) * 100 : null

  if (isLoading) return <LoadingSkeletonGrid count={8} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  if (!report || allDays.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
        ยังไม่มีข้อมูลสรุปยอดขาย — ตรวจว่าได้ redeploy Apps Script (เวอร์ชันที่อ่านแท็บ "รายงานคำสั่งซื้อ") แล้วหรือยัง
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <div className="flex min-w-0 items-center gap-2 sm:mr-auto">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm text-muted-foreground sm:hidden">สรุปยอดขาย BigSeller · {uniqueDateCount} วัน</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            สรุปยอดขาย BigSeller · ข้อมูลทั้งหมด {formatFullDateLabel(minDate)} &ndash; {formatFullDateLabel(maxDate)} ({uniqueDateCount} วัน) จากแท็บ "รายงานคำสั่งซื้อ ออนไลน์/ออฟไลน์"
          </span>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChannelFilter)}
            className="flex-1 rounded-lg border border-border bg-transparent px-2.5 py-2 text-base font-medium text-foreground outline-none sm:flex-none"
          >
            {(Object.keys(CHANNEL_FILTER_LABELS) as ChannelFilter[]).map((c) => (
              <option key={c} value={c} className="bg-popover text-popover-foreground">
                {CHANNEL_FILTER_LABELS[c]}
              </option>
            ))}
          </select>
          <DateRangePicker
            start={effectiveStart}
            end={effectiveEnd}
            minDate={minDate}
            maxDate={maxDate}
            today={maxDate}
            onChange={({ start, end }) => {
              setStartDate(start)
              setEndDate(end)
            }}
          />
        </div>
      </div>

      {channel === "all" && <ChannelComparisonPanel days={daysInRange} />}

      {days.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
          ไม่มีข้อมูลในช่วงวันที่ที่เลือก — ลองเลือกช่วงวันที่อื่น
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <KpiCard
          title="ยอดขายรวม (มีผล)"
          value={totals.totalEffSales}
          icon={Wallet}
          gradient="bg-gradient-to-br from-brand-600 to-brand-700"
          formatValue={compactMoney}
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
          title="ยอดขายสุทธิ (หลังหักคืนเงิน)"
          value={totals.totalEffSales - totals.totalRefundAmount}
          icon={Coins}
          gradient="bg-gradient-to-br from-cyan-500 to-blue-600"
          formatValue={compactMoney}
          subtitle={`${(((totals.totalEffSales - totals.totalRefundAmount) / (totals.totalEffSales || 1)) * 100).toFixed(1)}% ของยอดขายมีผล · คืนเงิน ${money(totals.totalRefundAmount)}`}
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
          formatValue={compactMoney}
          subtitle={`${((totals.totalDiscountCode / (totals.totalEffSales || 1)) * 100).toFixed(1)}% ของยอดขายรวม`}
        />
      </div>

      <ExtraStatsPanel totals={totals} />

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
            <AovTrendChart days={days} />
          </Suspense>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DayTable title="Top 5 วันที่ขายดีที่สุด" rows={top} tone="top" />
        <DayTable title="Bottom 5 วันที่ขายน้อยที่สุด" rows={bottom} tone="bottom" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="glass-panel rounded-2xl p-4">
          <Badge variant="outline" className="mb-2.5 border-emerald-glow/40 text-emerald-glow">
            <TrendingUp className="mr-1 size-3" /> PEAK DAY
          </Badge>
          <h3 className="mb-2 text-base font-semibold text-foreground">
            {peak ? `${formatFullDateLabel(peak.date)} ทำยอดสูงสุด` : "-"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {peak &&
              `ยอดขาย ${money(peak.effSales)} จาก ${peak.effOrders.toLocaleString("th-TH")} ออเดอร์ (AOV ${money(peak.aov)}) สูงกว่าค่าเฉลี่ยรายวัน (${money(
                totals.totalEffSales / (totals.nDays || 1)
              )}) ${(peak.effSales / (totals.totalEffSales / (totals.nDays || 1))).toFixed(1)} เท่า`}
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <Badge variant="secondary" className="mb-2.5">
            <Coins className="mr-1 size-3" /> NET SALES
          </Badge>
          <h3 className="mb-2 text-base font-semibold text-foreground">
            ยอดขายสุทธิคิดเป็น {(((totals.totalEffSales - totals.totalRefundAmount) / (totals.totalEffSales || 1)) * 100).toFixed(1)}% ของยอดขายมีผล
          </h3>
          <p className="text-sm text-muted-foreground">
            ยอดขายมีผล {money(totals.totalEffSales)} หักยอดคืนเงิน {money(totals.totalRefundAmount)} เหลือยอดขายสุทธิ{" "}
            {money(totals.totalEffSales - totals.totalRefundAmount)} ตลอดช่วง {totals.nDays} วัน
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <Badge variant="secondary" className="mb-2.5">
            PATTERN
          </Badge>
          <h3 className="mb-2 text-base font-semibold text-foreground">
            วัน{WEEKDAY_LABELS_TH_FULL[bestWdIdx]}ขายดีสุด วัน{WEEKDAY_LABELS_TH_FULL[worstWdIdx]}ขายน้อยสุด
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasWeekdayComparison
              ? `ยอดขายเฉลี่ยวัน${WEEKDAY_LABELS_TH_FULL[bestWdIdx]}สูงกว่าวัน${WEEKDAY_LABELS_TH_FULL[worstWdIdx]}ประมาณ ${weekdayUpliftPct!.toFixed(0)}% — ใช้จัดโปรโมชัน/สต็อกให้สอดคล้องกับพฤติกรรมลูกค้ารายสัปดาห์`
              : `วัน${WEEKDAY_LABELS_TH_FULL[worstWdIdx]}ในช่วงนี้ยังไม่มียอดขาย — ข้อมูลไม่พอสำหรับเทียบเป็น % ลองเลือกช่วงวันที่ให้ยาวขึ้น`}
          </p>
        </div>
      </div>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        ที่มาข้อมูล: ชีต "รายงานคำสั่งซื้อ ออนไลน์" และ "รายงานคำสั่งซื้อ ออฟไลน์" (BigSeller export) · เลือกช่องทางได้จากตัวกรองด้านบน · ข้อจำกัด: ไม่แยกตาม SKU,
        และ AOV/อัตราคืนเงินคำนวณแบบถ่วงน้ำหนัก (ยอดขายรวม/ออเดอร์รวม) ไม่ใช่ค่าเฉลี่ยอย่างง่ายของแต่ละวัน
      </p>
      </>
      )}
    </div>
  )
}
