import { ClampText } from "@/components/common/ClampText"
import { lazy, Suspense, useMemo, useState } from "react"
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Trophy,
  CalendarDays,
  CalendarRange,
  ChevronDown,
} from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { filterSelectClass } from "@/components/returns/ReturnsUi"
import { SalesHero } from "@/components/reports/SalesHero"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { DataNotice } from "@/components/common/DataNotice"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { ChannelComparisonPanel } from "@/components/reports/ChannelComparisonPanel"
import { StoreReportPanel } from "@/components/reports/StoreReportPanel"
import { formatFullDateLabel } from "@/lib/format"
import { getDatePresets } from "@/lib/dashboard-selectors"
import {
  sortedOrderReportDays,
  computeOrderReportTotals,
  topBottomDays,
  peakDay,
  weekdayAverages,
  applyChannelFilter,
  computeChannelComparison,
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
const MonthlyTrendChart = lazy(() => import("@/components/charts/MonthlyTrendChart").then((m) => ({ default: m.MonthlyTrendChart })))

function ChartFallback({ height = 300 }: { height?: number }) {
  return <Skeleton className="rounded-2xl" style={{ height }} />
}

const money = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`

/** A page section: a clear heading and one line saying what the numbers cover. */
function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="px-1 pt-2">
      <h2 className="page-heading text-xl font-extrabold text-foreground">{title}</h2>
      {caption && <ClampText className="mt-0.5 text-sm text-muted-foreground">{caption}</ClampText>}
    </div>
  )
}

/** A highlight card: icon chip, one big figure, a headline and one explanatory line. */
function InsightCard({
  icon: Icon,
  accent,
  eyebrow,
  big,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>
  accent: string
  eyebrow: string
  big: string
  title: string
  text: string
}) {
  return (
    <div className="glass-panel relative overflow-hidden rounded-2xl p-5 shadow-[0_18px_40px_-24px_rgba(43,168,162,0.6)]">
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}33)` }} aria-hidden />
      <span className="pointer-events-none absolute -right-6 -top-8 size-28 rounded-full opacity-25 blur-2xl" style={{ background: accent }} aria-hidden />
      <p className="relative flex items-center gap-2 text-sm font-extrabold text-foreground">
        <span
          className="flex size-9 items-center justify-center rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_6px_12px_-6px_rgba(0,0,0,0.35)]"
          style={{ background: `linear-gradient(145deg, ${accent}33, ${accent}1a)`, color: accent }}
        >
          <Icon className="size-5" />
        </span>
        {eyebrow}
      </p>
      <p className="relative mt-3 text-[22px] font-extrabold tabular-nums text-foreground sm:text-3xl">{big}</p>
      <h3 className="relative mt-0.5 text-base font-bold text-foreground">{title}</h3>
      <p className="relative mt-1.5 text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function DayTable({ title, rows, tone }: { title: string; rows: OrderReportDay[]; tone: "top" | "bottom" }) {
  const Icon = tone === "top" ? Trophy : TrendingDown
  const maxSales = Math.max(1, ...rows.map((r) => r.effSales))
  return (
    <div className="glass-panel relative overflow-x-auto rounded-2xl p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${tone === "top" ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden />
      <h3 className="mb-2.5 flex items-center gap-2 text-base font-bold text-foreground">
        <span
          className={`flex size-8 items-center justify-center rounded-full ${
            tone === "top" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
          }`}
        >
          <Icon className="size-4" />
        </span>
        {title}
      </h3>
      <table className="stack-table w-full min-w-[480px] text-left text-base">
        <thead>
          <tr className="border-b border-border text-sm text-muted-foreground">
            <th className="pb-2.5 font-medium">วันที่</th>
            <th className="pb-2.5 font-medium text-right">ยอดขาย (฿)</th>
            <th className="pb-2.5 font-medium text-right">ออเดอร์</th>
            <th className="pb-2.5 font-medium text-right">เฉลี่ยต่อออเดอร์ (฿)</th>
            <th className="pb-2.5 font-medium text-right">อัตรายกเลิก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const cancelRate = d.totalOrders > 0 ? (d.cancelledOrders / d.totalOrders) * 100 : 0
            const highlight = tone === "top" ? i === 0 : i < 3
            return (
              <tr key={d.date} className="border-b border-white/5 last:border-0">
                <td className={`stack-title ${highlight ? (tone === "top" ? "py-2.5 font-semibold text-emerald-glow" : "py-2.5 font-semibold text-destructive") : "py-2.5 text-foreground"}`}>
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold shadow-sm ${
                        i === 0
                          ? tone === "top"
                            ? "bg-gradient-to-br from-gold-light to-gold text-[#5c4300]"
                            : "bg-gradient-to-br from-rose-300 to-rose-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </span>
                    {formatFullDateLabel(d.date)}
                  </span>
                </td>
                <td data-label="ยอดขาย (฿)" className="py-2.5 text-right tabular-nums">
                  {d.effSales.toLocaleString("th-TH", { maximumFractionDigits: 0 })}
                  <span className="ml-auto mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-muted max-sm:hidden">
                    <span
                      className={`block h-full rounded-full ${tone === "top" ? "bg-gradient-to-r from-emerald-300 to-emerald-500" : "bg-gradient-to-r from-rose-300 to-rose-500"}`}
                      style={{ width: `${(d.effSales / maxSales) * 100}%` }}
                    />
                  </span>
                </td>
                <td data-label="ออเดอร์" className="py-2.5 text-right tabular-nums text-muted-foreground">{d.effOrders.toLocaleString("th-TH")}</td>
                <td data-label="เฉลี่ยต่อออเดอร์ (฿)" className="py-2.5 text-right tabular-nums text-muted-foreground">{d.aov.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</td>
                <td data-label="อัตรายกเลิก" className="py-2.5 text-right tabular-nums text-muted-foreground">{cancelRate.toFixed(1)}%</td>
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
    <details className="glass-panel group rounded-2xl p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span>
          <span className="block text-base font-extrabold text-foreground">รายละเอียดเพิ่มเติมจากชีต</span>
          <span className="block text-sm text-muted-foreground">ทุกคอลัมน์ในชีตรายงานคำสั่งซื้อ ที่ไม่ได้อยู่ในการ์ดหลักด้านบน — กดเพื่อดู</span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="จำนวนพัสดุ" value={`${totals.totalParcels.toLocaleString("th-TH")} พัสดุ`} />
        <StatChip label="รายได้รวม" value={money(totals.totalRevenue)} />
        <StatChip label="เงินอุดหนุนจากผู้ขาย" value={money(totals.totalSellerSubsidy)} />
        <StatChip label="ยอดขายสินค้า" value={money(totals.totalProductSales)} />
        <StatChip label="ราคาสินค้าเดิม" value={money(totals.totalOrigPrice)} />
        <StatChip
          label="ส่วนลดสินค้ารวม"
          value={hasOrigPriceData ? `${money(discountAmount)} (${discountPct.toFixed(1)}%)` : "ไม่มีข้อมูล"}
        />
        <StatChip label="ยอดขาย (ตามคอลัมน์ในชีต)" value={money(totals.totalSales)} />
        <StatChip label="ยอดคืนเงินรวม" value={money(totals.totalRefundAmount)} tone="rose" />
        <StatChip
          label="ออเดอร์/ลูกค้าที่คืนเงิน"
          value={`${totals.totalRefundOrders.toLocaleString("th-TH")} / ${totals.totalRefundCustomers.toLocaleString("th-TH")}`}
          tone="rose"
        />
        <StatChip label="มูลค่าออเดอร์ที่ยกเลิก" value={money(totals.totalCancelledAmount)} tone="rose" />
        <StatChip
          label="ออเดอร์ที่ยกเลิก"
          value={`${totals.totalCancelledOrders.toLocaleString("th-TH")} ออเดอร์ (${totals.cancelRate.toFixed(1)}%)`}
          tone="rose"
        />
      </div>
    </details>
  )
}

export function SalesSummary() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const report = data?.orderReport ?? null
  const storeReportRows = data?.storeReport?.rows ?? []

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
  const channelSplit = useMemo(() => computeChannelComparison(daysInRange), [daysInRange])
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
      <DataNotice
        title="ยังไม่มีข้อมูลสรุปยอดขาย"
        detail='ไม่พบข้อมูลจากแท็บ "รายงานคำสั่งซื้อ" (ต้อง redeploy Apps Script เวอร์ชันที่อ่านแท็บนี้)'
      />
    )
  }

  const avgPerDay = totals.totalEffSales / (totals.nDays || 1)
  const netSales = totals.totalEffSales - totals.totalRefundAmount
  const netPct = (netSales / (totals.totalEffSales || 1)) * 100

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <div className="flex min-w-0 items-center gap-2 sm:mr-auto">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarDays className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-foreground">สรุปยอดขาย BigSeller</p>
            <p className="text-xs text-muted-foreground">
              ข้อมูลทั้งหมด {formatFullDateLabel(minDate)} &ndash; {formatFullDateLabel(maxDate)} ({uniqueDateCount} วัน) · แท็บ "รายงานคำสั่งซื้อ ออนไลน์/ออฟไลน์"
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChannelFilter)}
            aria-label="ช่องทาง"
            className={`${filterSelectClass} flex-1 sm:flex-none`}
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

      {days.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
          ไม่มีข้อมูลในช่วงวันที่ที่เลือก — ลองเลือกช่วงวันที่อื่น
        </div>
      ) : (
        <>
          <SectionHeading
            title="ภาพรวมยอดขาย"
            caption={`${channel === "all" ? "ออนไลน์ + ออฟไลน์" : CHANNEL_FILTER_LABELS[channel]} · ${formatFullDateLabel(effectiveStart)} – ${formatFullDateLabel(effectiveEnd)} (${totals.nDays} วัน)`}
          />
          <SalesHero
            totals={totals}
            netSales={netSales}
            netPct={netPct}
            avgPerDay={avgPerDay}
            onlineSales={channelSplit.online.totalEffSales}
            offlineSales={channelSplit.offline.totalEffSales}
            channelLabel={channel === "all" ? "ออนไลน์ + ออฟไลน์" : CHANNEL_FILTER_LABELS[channel]}
            rangeLabel={`${formatFullDateLabel(effectiveStart)} – ${formatFullDateLabel(effectiveEnd)}`}
          />

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
          </div>
        </>
      )}

      {channel === "all" && (
        <>
          <SectionHeading title="เทียบออนไลน์กับออฟไลน์" caption="ตามช่วงวันที่ที่เลือก ไม่ขึ้นกับตัวกรองช่องทาง" />
          <ChannelComparisonPanel days={daysInRange} />
        </>
      )}

      {storeReportRows.length > 0 && (
        <>
          <SectionHeading title="ยอดขายแยกร้านค้า/ช่องทาง" caption="ข้อมูลรายเดือนจากรายงานร้านค้า BigSeller — ไม่ขึ้นกับช่วงวันที่ด้านบน" />
          <StoreReportPanel rows={storeReportRows} />
        </>
      )}

      {days.length > 0 && (
        <>
          <SectionHeading title="แนวโน้มและวันเด่น" caption="ดูว่ายอดขายเปลี่ยนไปอย่างไรตามสัปดาห์ เดือน และยอดเฉลี่ยต่อออเดอร์" />
          <div className="grid grid-cols-12 gap-4">
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
            <div className="col-span-12">
              <Suspense fallback={<ChartFallback height={320} />}>
                <MonthlyTrendChart days={days} />
              </Suspense>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DayTable title="5 วันที่ขายดีที่สุด" rows={top} tone="top" />
            <DayTable title="5 วันที่ขายน้อยที่สุด" rows={bottom} tone="bottom" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InsightCard
              icon={TrendingUp}
              accent="#27ae60"
              eyebrow="วันที่ขายสูงสุด"
              big={peak ? money(peak.effSales) : "-"}
              title={peak ? formatFullDateLabel(peak.date) : "-"}
              text={
                peak
                  ? `จาก ${peak.effOrders.toLocaleString("th-TH")} ออเดอร์ (เฉลี่ย ${money(peak.aov)} ต่อออเดอร์) สูงกว่าค่าเฉลี่ยรายวัน (${money(avgPerDay)}) ${(peak.effSales / avgPerDay).toFixed(1)} เท่า`
                  : ""
              }
            />
            <InsightCard
              icon={Coins}
              accent="#5dade2"
              eyebrow="ยอดขายสุทธิ"
              big={`${netPct.toFixed(1)}%`}
              title="ของยอดขายมีผล"
              text={`ยอดขายมีผล ${money(totals.totalEffSales)} หักยอดคืนเงิน ${money(totals.totalRefundAmount)} เหลือยอดขายสุทธิ ${money(netSales)} ตลอดช่วง ${totals.nDays} วัน`}
            />
            <InsightCard
              icon={CalendarRange}
              accent="#2ba8a2"
              eyebrow="รูปแบบรายสัปดาห์"
              big={`วัน${WEEKDAY_LABELS_TH_FULL[bestWdIdx]}`}
              title={`ขายดีสุด · วัน${WEEKDAY_LABELS_TH_FULL[worstWdIdx]}ขายน้อยสุด`}
              text={
                hasWeekdayComparison
                  ? `ยอดขายเฉลี่ยวัน${WEEKDAY_LABELS_TH_FULL[bestWdIdx]}สูงกว่าวัน${WEEKDAY_LABELS_TH_FULL[worstWdIdx]}ประมาณ ${weekdayUpliftPct!.toFixed(0)}% — ใช้จัดโปรโมชัน/สต็อกให้สอดคล้องกับพฤติกรรมลูกค้ารายสัปดาห์`
                  : `วัน${WEEKDAY_LABELS_TH_FULL[worstWdIdx]}ในช่วงนี้ยังไม่มียอดขาย — ข้อมูลไม่พอสำหรับเทียบเป็น % ลองเลือกช่วงวันที่ให้ยาวขึ้น`
              }
            />
          </div>

          <ExtraStatsPanel totals={totals} />

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            ที่มาข้อมูล: ชีต "รายงานคำสั่งซื้อ ออนไลน์" และ "รายงานคำสั่งซื้อ ออฟไลน์" (BigSeller export) · เลือกช่องทางได้จากตัวกรองด้านบน · ข้อจำกัด: ไม่แยกตาม SKU,
            และยอดเฉลี่ยต่อออเดอร์/อัตราคืนเงินคำนวณแบบถ่วงน้ำหนัก (ยอดขายรวม/ออเดอร์รวม) ไม่ใช่ค่าเฉลี่ยอย่างง่ายของแต่ละวัน
          </p>
        </>
      )}
    </div>
  )
}
