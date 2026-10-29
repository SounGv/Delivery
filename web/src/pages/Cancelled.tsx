import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Ban, CheckCircle2, Clock, Hourglass, PackageCheck, XCircle } from "lucide-react"
import type { EChartsOption } from "echarts"
import { useCancelledQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { ExportButton } from "@/components/common/ExportButton"
import { ChartCard } from "@/components/charts/ChartCard"
import { EChart } from "@/components/charts/EChart"
import { Tabs } from "@/components/ui/Tabs"
import { cancelledReport } from "@/lib/reportExports"
import { readChartTheme } from "@/lib/chart-theme"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import {
  CANCELLED_STATUSES,
  DEFAULT_STALE_DAYS,
  breakdownByChannel,
  breakdownByDay,
  breakdownByPicker,
  computeCancelledTotals,
  daysBetween,
  distinctChannels,
  isStaleCancelled,
} from "@/lib/cancelled-selectors"
import type { CancelledRow, CancelledStatus } from "@/api/types"

const ALL = "__all__"
const PAGE_SIZE = 50
const STALE_CHOICES = [1, 2, 3, 5, 7]
const num = (n: number) => n.toLocaleString("th-TH")

/** Cancelled-order scan log ("สินค้ายกเลิก"), kept apart from product returns. Two
 * kinds of cancellation live in two tabs of the gv-returns-sync workbook — stock
 * already deducted vs. not deducted — so each gets its own tab here. The status
 * (รอตรวจสอบ / รับแล้ว / ไม่ตรง) is the sheet's own, driven by what the warehouse
 * scans into the same row; this page only reads it. */
export function Cancelled() {
  const { data, isLoading, isError, error } = useCancelledQuery()
  const report = data?.cancelledOrders ?? null
  const rows = useMemo(() => report?.rows ?? [], [report])
  const deducted = useMemo(() => rows.filter((r) => r.stockDeducted), [rows])
  const notDeducted = useMemo(() => rows.filter((r) => !r.stockDeducted), [rows])

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  return (
    <div className="space-y-4">
      {(!report || report.error || report.missingTabs.length > 0) && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">ยังอ่านข้อมูลสินค้ายกเลิกจากชีต gv-returns-sync ไม่ได้</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {!report
                ? "ยังไม่มีข้อมูลนี้ใน payload — รอระบบหลังบ้านอัปเดต (deploy Apps Script เวอร์ชันล่าสุด)"
                : report.error
                  ? `สาเหตุ: ${report.error} — ตรวจว่าบัญชีที่ deploy Web App มีสิทธิ์เข้าถึงไฟล์ gv-returns-sync`
                  : `ไม่พบแท็บ: ${report.missingTabs.join(", ")}`}
            </p>
          </div>
        </div>
      )}

      <Tabs
        items={[
          {
            key: "deducted",
            label: `ตัดสต็อกแล้ว (${num(deducted.length)})`,
            icon: Ban,
            render: () => (
              <CancelledView
                key="deducted"
                rows={deducted}
                todayIso={data.todayDate}
                kindLabel="ตัดสต็อกแล้ว"
                description="ออเดอร์ที่ถูกยกเลิกหลังระบบตัดสต็อกไปแล้ว"
                duplicatesDropped={report?.duplicatesDropped ?? 0}
              />
            ),
          },
          {
            key: "not-deducted",
            label: `ยังไม่ตัดสต็อก (${num(notDeducted.length)})`,
            icon: Hourglass,
            render: () => (
              <CancelledView
                key="not-deducted"
                rows={notDeducted}
                todayIso={data.todayDate}
                kindLabel="ยังไม่ตัดสต็อก"
                description="ออเดอร์ที่ถูกยกเลิกโดยระบบยังไม่ได้ตัดสต็อก"
                duplicatesDropped={report?.duplicatesDropped ?? 0}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: CancelledStatus }) {
  const Icon = status === "รับแล้ว" ? CheckCircle2 : status === "ไม่ตรง" ? XCircle : Clock
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        status === "รับแล้ว" && "bg-emerald-glow/15 text-emerald-glow",
        status === "ไม่ตรง" && "bg-destructive/15 text-destructive",
        status === "รอตรวจสอบ" && "bg-amber-500/15 text-amber-500"
      )}
    >
      <Icon className="size-3.5" />
      {status}
    </span>
  )
}

function CancelledView({
  rows,
  todayIso,
  kindLabel,
  description,
  duplicatesDropped,
}: {
  rows: CancelledRow[]
  todayIso: string
  kindLabel: string
  description: string
  duplicatesDropped: number
}) {
  const { theme } = useTheme()
  const [channel, setChannel] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [search, setSearch] = useState("")
  const [staleDays, setStaleDays] = useState(DEFAULT_STALE_DAYS)
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [channel, status, from, to, search, staleDays])

  const channels = distinctChannels(rows)
  const query = search.trim().toLowerCase()

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (channel !== ALL && r.channel !== channel) return false
        if (from && r.date < from) return false
        if (to && r.date > to) return false
        if (query && !`${r.orderNo} ${r.sku} ${r.tracking} ${r.bsParcel}`.toLowerCase().includes(query)) return false
        if (status === "stale") return isStaleCancelled(r, todayIso, staleDays)
        if (status !== ALL && r.status !== status) return false
        return true
      }),
    [rows, channel, from, to, query, status, todayIso, staleDays]
  )

  const totals = computeCancelledTotals(filtered, todayIso, staleDays)
  const byChannel = breakdownByChannel(filtered)
  const byPicker = breakdownByPicker(filtered)
  const daily = useMemo(() => breakdownByDay(filtered), [filtered])
  const maxChannel = Math.max(1, ...byChannel.map((c) => c.lines))
  const maxPicker = Math.max(1, ...byPicker.map((p) => p.lines))

  const chartChannels = useMemo(() => distinctChannels(filtered), [filtered])
  const chartOption = useMemo<EChartsOption>(() => {
    const t = readChartTheme()
    return {
      textStyle: { color: t.muted },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, textStyle: { color: t.muted } },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: daily.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.muted },
      },
      yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.muted } },
      series: chartChannels.map((ch, i) => ({
        name: ch,
        type: "bar" as const,
        stack: "lines",
        data: daily.map((d) => d.byChannel[ch] ?? 0),
        barMaxWidth: 36,
        itemStyle: { color: t.barColors[i % t.barColors.length] },
      })),
    }
  }, [daily, chartChannels, theme])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const activeFilterCount = [channel !== ALL, status !== ALL, !!from, !!to, !!query].filter(Boolean).length
  const clearFilters = () => {
    setChannel(ALL)
    setStatus(ALL)
    setFrom("")
    setTo("")
    setSearch("")
  }

  const selectCls =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm outline-none hover:bg-muted"
  const pillCls = (active: boolean) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
      active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"
    )

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">ช่องทาง</label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setChannel(ALL)} className={pillCls(channel === ALL)}>
              ทั้งหมด
            </button>
            {channels.map((c) => (
              <button key={c} type="button" onClick={() => setChannel(c)} className={pillCls(channel === c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">สถานะ</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {CANCELLED_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s}</option>
            ))}
            <option value="stale" className="bg-popover text-popover-foreground">ค้างรอตรวจสอบเกินกำหนด</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">ตั้งแต่วันที่</label>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">ถึงวันที่</label>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={selectCls} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">เตือนเมื่อค้างเกิน</label>
          <select value={staleDays} onChange={(e) => setStaleDays(Number(e.target.value))} className={selectCls}>
            {STALE_CHOICES.map((d) => (
              <option key={d} value={d} className="bg-popover text-popover-foreground">{d} วัน</option>
            ))}
          </select>
        </div>
      </div>

      <p className="px-1 text-xs text-muted-foreground">{description} · ข้อมูลจากชีต gv-returns-sync (อัปเดตตามที่คลังสแกน)</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          title="ยกเลิกทั้งหมด"
          value={totals.lines}
          icon={Ban}
          gradient="bg-gradient-to-br from-brand-500 to-brand-700"
          suffix="รายการ"
          subtitle={`${num(totals.orders)} ออเดอร์ · ${num(totals.qty)} ชิ้น`}
        />
        <KpiCard
          title="รอตรวจสอบ"
          value={totals.pending}
          icon={Clock}
          gradient="bg-gradient-to-br from-amber-500 to-rose-500"
          suffix="รายการ"
          subtitle="ยังไม่ได้สแกนรับของกลับ"
        />
        <KpiCard
          title={`ค้างเกิน ${staleDays} วัน`}
          value={totals.stale}
          icon={AlertTriangle}
          gradient="bg-gradient-to-br from-rose-500 to-destructive"
          suffix="รายการ"
          subtitle="รอตรวจสอบนานเกินกำหนด"
        />
        <KpiCard title="รับแล้ว" value={totals.received} icon={PackageCheck} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="รายการ" />
        <KpiCard
          title="ไม่ตรง"
          value={totals.mismatch}
          icon={XCircle}
          gradient="bg-gradient-to-br from-destructive to-rose-700"
          suffix="รายการ"
          subtitle="เลขที่สแกนไม่ตรงกับออเดอร์"
        />
        <KpiCard
          title="% รับแล้ว"
          value={totals.lines ? (totals.received / totals.lines) * 100 : null}
          icon={CheckCircle2}
          gradient="bg-gradient-to-br from-sky-500 to-brand-600"
          formatValue={(n) => `${n.toFixed(1)}%`}
        />
      </div>

      <ChartCard title="ยกเลิกรายวัน" subtitle="จำนวนรายการต่อวัน แยกตามช่องทาง" emoji="📉">
        {daily.length > 0 ? (
          <EChart option={chartOption} height={260} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</p>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">แยกตามช่องทาง</h3>
          <div className="space-y-2.5">
            {byChannel.map((c) => (
              <div key={c.channel} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-xs font-semibold text-foreground">{c.channel}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(c.lines / maxChannel) * 100}%` }} />
                </div>
                <span className="w-36 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  <b className="text-foreground">{num(c.lines)}</b> รายการ · รอตรวจสอบ {num(c.pending)}
                </span>
              </div>
            ))}
            {byChannel.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีข้อมูล</p>}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">ผู้รับของกลับ (ชื่อคนเก็บ)</h3>
          <div className="space-y-2.5">
            {byPicker.map((p) => (
              <div key={p.picker} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-xs font-semibold text-foreground">{p.picker}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-glow" style={{ width: `${(p.lines / maxPicker) * 100}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  <b className="text-foreground">{num(p.lines)}</b> รายการ · {num(p.qty)} ชิ้น
                </span>
              </div>
            ))}
            {byPicker.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีรายการที่ระบุชื่อคนเก็บ</p>}
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <div className="section-title mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold tracking-wide text-foreground">รายการยกเลิก · {kindLabel}</h3>
            <p className="text-[11px] text-muted-foreground">
              แสดง {num(pageRows.length ? pageStart + 1 : 0)}-{num(pageStart + pageRows.length)} จาก {num(filtered.length)} รายการ (ทั้งหมด {num(rows.length)})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="ค้นหาเลขคำสั่งซื้อ SKU หรือเลขแทร็คกิ้ง"
              placeholder="ค้นหา ออเดอร์ / SKU / แทร็คกิ้ง"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "w-56 rounded-full border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground",
                search ? "border-primary bg-primary/10" : "border-border"
              )}
            />
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-border px-3 py-2 text-xs font-bold text-coral-dark transition-colors hover:bg-muted"
              >
                ล้างตัวกรอง ({activeFilterCount})
              </button>
            )}
            <ExportButton
              disabled={filtered.length === 0}
              label={`ส่งออก ${num(filtered.length)} รายการ`}
              build={() => cancelledReport(filtered, kindLabel, todayIso)}
            />
          </div>
        </div>

        <table className="w-full min-w-[1000px] text-left text-sm [&_td]:px-2 [&_th]:px-2">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">วันที่</th>
              <th className="pb-2 font-medium">ช่องทาง</th>
              <th className="pb-2 font-medium">เลขคำสั่งซื้อ</th>
              <th className="pb-2 font-medium">SKU</th>
              <th className="pb-2 text-right font-medium">จำนวน</th>
              <th className="pb-2 font-medium">แทร็คกิ้ง</th>
              <th className="pb-2 font-medium">ผู้พิมพ์ใบปะหน้า</th>
              <th className="pb-2 font-medium">สถานะ</th>
              <th className="pb-2 font-medium">ผู้เก็บ</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => {
              const waitingDays = r.status === "รอตรวจสอบ" ? daysBetween(r.date, todayIso) : 0
              const stale = isStaleCancelled(r, todayIso, staleDays)
              return (
                <tr key={`${r.bsParcel}-${r.orderNo}-${r.sku}-${pageStart + i}`} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">{r.date}</td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{r.channel || "-"}</span>
                  </td>
                  <td className="py-2.5 font-medium text-foreground">{r.orderNo || "-"}</td>
                  <td className="py-2.5 text-muted-foreground">{r.sku || "-"}</td>
                  <td className="py-2.5 text-right tabular-nums">{num(r.qty)}</td>
                  <td className="py-2.5 text-xs text-muted-foreground">{r.tracking || "-"}</td>
                  <td className="py-2.5 text-xs text-muted-foreground">{r.printer || "-"}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={r.status} />
                      {stale && <span className="whitespace-nowrap text-xs font-semibold text-destructive">ค้าง {num(waitingDays)} วัน</span>}
                    </div>
                  </td>
                  <td className="py-2.5 text-xs text-foreground">{r.picker || "-"}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  {rows.length > 0 ? "ไม่มีรายการตามเงื่อนไขที่เลือก" : "ยังไม่มีข้อมูลในแท็บนี้"}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              ก่อนหน้า
            </button>
            <span className="text-xs text-muted-foreground">หน้า {num(pageSafe)} จาก {num(totalPages)}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          สถานะอ่านจากช่องสแกนของคลังในชีต: <b className="text-foreground">รอตรวจสอบ</b> = ยังไม่สแกนรับของกลับ ·{" "}
          <b className="text-foreground">รับแล้ว</b> = เลขที่สแกนตรงกับเลขออเดอร์หรือแทร็คกิ้ง ·{" "}
          <b className="text-foreground">ไม่ตรง</b> = สแกนแล้วแต่เลขไม่ตรง
          {duplicatesDropped > 0 && ` · รวมรายการซ้ำ (พัสดุ+ออเดอร์+SKU เดียวกัน) แล้ว ${num(duplicatesDropped)} แถว`}
        </p>
      </div>
    </div>
  )
}
