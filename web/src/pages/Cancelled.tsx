import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Ban, CalendarClock, CheckCircle2, ChevronDown, Clock, Hourglass, Layers, PackageCheck, XCircle } from "lucide-react"
import type { EChartsOption } from "echarts"
import { useCancelledQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { ExportButton } from "@/components/common/ExportButton"
import { DataNotice } from "@/components/common/DataNotice"
import { ChartCard } from "@/components/charts/ChartCard"
import { EChart } from "@/components/charts/EChart"
import {
  FilterField,
  ListToolbar,
  Pager,
  ReturnRowCard,
  StatusPill,
  StatusTile,
  chipClass,
  filterSelectClass,
  type Tone,
} from "@/components/returns/ReturnsUi"
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
import type { CancelledOrdersReport, CancelledRow, CancelledStatus } from "@/api/types"

const ALL = "__all__"
const STALE = "stale"
const DONE = "done"
const PAGE_SIZE = 30
const STALE_CHOICES = [1, 2, 3, 5, 7]
const num = (n: number) => n.toLocaleString("th-TH")

/** Cancelled-order scan log ("สินค้ายกเลิก"), kept apart from product returns. Two
 * kinds of cancellation live in two tabs of the gv-returns-sync workbook — stock
 * already deducted vs. not deducted — so each gets its own tab here. The status
 * (รอตรวจสอบ / รับแล้ว / ปิดงาน / ไม่ตรง) is the sheet's own — set by what the warehouse
 * scans into the same row, or by BigSeller's Stock-In / the carrier refund for
 * "ปิดงาน"; this page only reads it. Status colours are the returns page's contract
 * (see components/returns/ReturnsUi.tsx). */
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
      <CancelledWarning report={report} />

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
                description="ออเดอร์ที่ยกเลิกหลังตัดสต็อก ต้องรับของคืนเข้าคลัง"
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
                description="ออเดอร์ที่ยกเลิกก่อนตัดสต็อก ต้องเก็บของกลับเข้าที่"
                duplicatesDropped={report?.duplicatesDropped ?? 0}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

/** Shown when the cancelled-order log cannot be read (no part in the payload, an error, or a missing tab). */
export function CancelledWarning({ report }: { report: CancelledOrdersReport | null }) {
  if (report && !report.error && report.missingTabs.length === 0) return null
  return (
    <DataNotice
      title="ยังอ่านข้อมูลสินค้ายกเลิกไม่ได้"
      detail={
        !report
          ? "ยังไม่มีข้อมูลส่วนนี้ใน payload (ต้อง deploy Apps Script เวอร์ชันล่าสุด)"
          : report.error
            ? `สาเหตุ: ${report.error} — ตรวจว่าบัญชีที่ deploy Web App เข้าถึงไฟล์ gv-returns-sync ได้`
            : `ไม่พบแท็บ: ${report.missingTabs.join(", ")}`
      }
    />
  )
}

const STATUS_TONE: Record<CancelledStatus, Tone> = {
  รอตรวจสอบ: "warn",
  รับแล้ว: "ok",
  ปิดงาน: "ok",
  ไม่ตรง: "danger",
}
const STATUS_ICON = { รอตรวจสอบ: Clock, รับแล้ว: CheckCircle2, ปิดงาน: PackageCheck, ไม่ตรง: XCircle }

export function CancelledView({
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
  const [showCharts, setShowCharts] = useState(false)
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
        if (status === STALE) return isStaleCancelled(r, todayIso, staleDays)
        if (status === DONE) return r.status === "รับแล้ว" || r.status === "ปิดงาน"
        if (status !== ALL && r.status !== status) return false
        return true
      }),
    [rows, channel, from, to, query, status, todayIso, staleDays]
  )

  // The tiles always show the totals of the rows that pass the non-status filters, so each tile
  // keeps its meaning while one of them is selected.
  const base = useMemo(
    () =>
      rows.filter((r) => {
        if (channel !== ALL && r.channel !== channel) return false
        if (from && r.date < from) return false
        if (to && r.date > to) return false
        if (query && !`${r.orderNo} ${r.sku} ${r.tracking} ${r.bsParcel}`.toLowerCase().includes(query)) return false
        return true
      }),
    [rows, channel, from, to, query]
  )
  const totals = computeCancelledTotals(base, todayIso, staleDays)
  const done = totals.received + totals.closed
  const donePct = totals.lines ? (done / totals.lines) * 100 : null

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

  // What needs chasing goes first: mismatches, then overdue, then waiting; finished lines last.
  // Inside each group the oldest cancellation comes first.
  const ordered = useMemo(() => {
    const rank = (r: CancelledRow) =>
      r.status === "ไม่ตรง" ? 0 : isStaleCancelled(r, todayIso, staleDays) ? 1 : r.status === "รอตรวจสอบ" ? 2 : 3
    return [...filtered].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date))
  }, [filtered, todayIso, staleDays])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageRows = ordered.slice(pageStart, pageStart + PAGE_SIZE)

  const activeFilterCount = [channel !== ALL, status !== ALL, !!from, !!to, !!query].filter(Boolean).length
  const clearFilters = () => {
    setChannel(ALL)
    setStatus(ALL)
    setFrom("")
    setTo("")
    setSearch("")
  }
  const toggleStatus = (value: string) => setStatus(status === value ? ALL : value)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="page-heading text-lg font-extrabold text-foreground">ยกเลิก · {kindLabel}</h2>
          <p className="text-xs text-muted-foreground">
            {description} · 1 แถว = 1 SKU · กดการ์ดสถานะเพื่อกรอง · ที่มา: ชีต gv-returns-sync
          </p>
        </div>
        {donePct !== null && (
          <StatusPill tone={donePct >= 90 ? "ok" : donePct >= 60 ? "warn" : "danger"} icon={CheckCircle2}>
            เสร็จสิ้นแล้ว {donePct.toFixed(1)}%
          </StatusPill>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatusTile
          tone="neutral"
          icon={Layers}
          label="ทั้งหมด"
          count={totals.lines}
          unit="รายการ"
          sub={`${num(totals.orders)} ออเดอร์ · ${num(totals.qty)} ชิ้น`}
          active={status === ALL}
          onClick={() => setStatus(ALL)}
        />
        <StatusTile
          tone="warn"
          icon={Clock}
          label="รอตรวจสอบ"
          count={totals.pending}
          unit="รายการ"
          sub="ยังไม่สแกนรับ และยังไม่ Stock-In"
          active={status === "รอตรวจสอบ"}
          onClick={() => toggleStatus("รอตรวจสอบ")}
        />
        <StatusTile
          tone="danger"
          icon={AlertTriangle}
          label={`ค้างเกิน ${staleDays} วัน`}
          count={totals.stale}
          unit="รายการ"
          sub="รอตรวจสอบนานเกินกำหนด"
          active={status === STALE}
          onClick={() => toggleStatus(STALE)}
        />
        <StatusTile
          tone="ok"
          icon={CheckCircle2}
          label="เสร็จสิ้นแล้ว"
          count={done}
          unit="รายการ"
          sub={`สแกนรับ ${num(totals.received)} · ปิดงาน ${num(totals.closed)}`}
          active={status === DONE}
          onClick={() => toggleStatus(DONE)}
        />
        <StatusTile
          tone="danger"
          icon={XCircle}
          label="ไม่ตรง"
          count={totals.mismatch}
          unit="รายการ"
          sub="เลขที่สแกนไม่ตรงกับออเดอร์"
          active={status === "ไม่ตรง"}
          onClick={() => toggleStatus("ไม่ตรง")}
        />
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="ค้นหา ออเดอร์ / SKU / แทร็คกิ้ง / พัสดุ"
        chips={
          <>
            <button type="button" onClick={() => setChannel(ALL)} className={chipClass(channel === ALL)}>
              ทุกช่องทาง
            </button>
            {channels.map((c) => (
              <button key={c} type="button" onClick={() => setChannel(c)} className={chipClass(channel === c)}>
                {c}
              </button>
            ))}
          </>
        }
        moreFilters={
          <>
            <FilterField label="สถานะ (ละเอียด)">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                {CANCELLED_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                <option value={STALE}>ค้างรอตรวจสอบเกินกำหนด</option>
              </select>
            </FilterField>
            <FilterField label="ตั้งแต่วันที่">
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={filterSelectClass} />
            </FilterField>
            <FilterField label="ถึงวันที่">
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={filterSelectClass} />
            </FilterField>
            <FilterField label="เตือนเมื่อค้างเกิน">
              <select value={staleDays} onChange={(e) => setStaleDays(Number(e.target.value))} className={filterSelectClass}>
                {STALE_CHOICES.map((d) => (
                  <option key={d} value={d}>{d} วัน</option>
                ))}
              </select>
            </FilterField>
          </>
        }
        activeCount={activeFilterCount}
        onClear={clearFilters}
        actions={
          <ExportButton
            disabled={filtered.length === 0}
            label={`ส่งออก ${num(filtered.length)} รายการ`}
            build={() => cancelledReport(filtered, kindLabel, todayIso)}
          />
        }
      />

      <p className="px-1 text-xs text-muted-foreground">
        แสดง {num(pageRows.length ? pageStart + 1 : 0)}-{num(pageStart + pageRows.length)} จาก {num(filtered.length)} รายการ (ทั้งหมด {num(rows.length)}) · เรียงเรื่องที่ต้องตามขึ้นก่อน (ไม่ตรง → ค้างเกินกำหนด → รอตรวจสอบ → เสร็จสิ้น)
      </p>

      <div className="space-y-2.5">
        {pageRows.map((r, i) => (
          <CancelledCard key={`${r.bsParcel}-${r.orderNo}-${r.sku}-${pageStart + i}`} row={r} todayIso={todayIso} staleDays={staleDays} />
        ))}
        {filtered.length === 0 && (
          <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {rows.length > 0 ? "ไม่มีรายการตามเงื่อนไขที่เลือก — ลองกด ล้างตัวกรอง" : "ยังไม่มีข้อมูลในแท็บนี้"}
          </div>
        )}
      </div>

      <Pager page={pageSafe} totalPages={totalPages} onChange={setPage} />

      <button
        type="button"
        onClick={() => setShowCharts((v) => !v)}
        aria-expanded={showCharts}
        className="glass-panel flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted/40"
      >
        <span>กราฟและสรุปแยกตามช่องทาง / คนเก็บ</span>
        <ChevronDown className={cn("size-5 transition-transform", showCharts && "rotate-180")} />
      </button>

      {showCharts && (
        <>
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
        </>
      )}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        สถานะอ่านจากชีต (ช่องสถานะ): <b className="text-foreground">รอตรวจสอบ</b> = ยังไม่มีใครสแกนรับของ และ BigSeller ยังไม่ขึ้น Stock-In ·{" "}
        <b className="text-foreground">รับแล้ว</b> = ทีมคลังสแกนเลขพัสดุแล้ว ·{" "}
        <b className="text-foreground">ปิดงาน</b> = BigSeller ขึ้น Stock-In ทั้งหมดแล้ว หรือได้เงินคืนจากขนส่งแล้ว ·{" "}
        <b className="text-foreground">ไม่ตรง</b> = สแกนแล้วแต่เลขไม่ตรงกับออเดอร์ ให้ตรวจอีกครั้ง
        {duplicatesDropped > 0 && ` · รวมรายการซ้ำ (พัสดุ+ออเดอร์+SKU เดียวกัน) แล้ว ${num(duplicatesDropped)} แถว`}
      </p>
    </div>
  )
}

function CancelledCard({ row: r, todayIso, staleDays }: { row: CancelledRow; todayIso: string; staleDays: number }) {
  const stale = isStaleCancelled(r, todayIso, staleDays)
  const waitingDays = r.status === "รอตรวจสอบ" ? daysBetween(r.date, todayIso) : 0
  const tone: Tone = stale ? "danger" : STATUS_TONE[r.status]
  const StatusIcon = STATUS_ICON[r.status]

  return (
    <ReturnRowCard
      tone={tone}
      status={
        <>
          <StatusPill tone={STATUS_TONE[r.status]} icon={StatusIcon}>
            {r.status}
          </StatusPill>
          {stale && (
            <StatusPill tone="danger" icon={AlertTriangle}>
              ค้าง {num(waitingDays)} วัน
            </StatusPill>
          )}
          {r.status === "ปิดงาน" && r.closedReason && <p className="w-full text-[11px] text-muted-foreground">{r.closedReason}</p>}
          {r.status === "รับแล้ว" && r.scanned && <p className="w-full text-[11px] text-muted-foreground">สแกน {r.scanned}</p>}
        </>
      }
      item={
        <>
          <p className="text-sm font-semibold text-foreground">{r.sku || "-"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">จำนวน {num(r.qty)} ชิ้น</p>
          <p className="mt-1.5 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{r.channel || "-"}</span>
          </p>
        </>
      }
      refs={
        <dl className="space-y-0.5">
          <div className="flex gap-1.5">
            <dt className="w-14 shrink-0 text-muted-foreground">ออเดอร์</dt>
            <dd className="break-all font-medium text-foreground">{r.orderNo || "-"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="w-14 shrink-0 text-muted-foreground">พัสดุ</dt>
            <dd className="break-all text-foreground">{r.bsParcel || "-"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="w-14 shrink-0 text-muted-foreground">แทร็คกิ้ง</dt>
            <dd className="break-all text-foreground">{r.tracking || "-"}</dd>
          </div>
        </dl>
      }
      dates={
        <div className="space-y-0.5 text-muted-foreground">
          <p className="flex items-center gap-1">
            <CalendarClock className="size-3.5" />
            ยกเลิก {r.date}
          </p>
          {r.printedAt && <p>พิมพ์ {r.printedAt}</p>}
        </div>
      }
      money={
        <div className="space-y-0.5 text-muted-foreground">
          <p>
            ผู้พิมพ์ใบปะหน้า <span className="font-semibold text-foreground">{r.printer || "-"}</span>
          </p>
          <p>
            ชื่อคนเก็บ <span className="font-semibold text-foreground">{r.picker || "-"}</span>
          </p>
        </div>
      }
    />
  )
}
