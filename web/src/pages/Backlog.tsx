import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArchiveRestore, Banknote, Hourglass, ListChecks, PackageCheck, PackageX, Truck } from "lucide-react"
import { useFocusQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { ExportButton } from "@/components/common/ExportButton"
import { Tabs } from "@/components/ui/Tabs"
import { backlogReport } from "@/lib/reportExports"
import { cn } from "@/lib/utils"
import { ageBand, distinctTexts, sortByAge, sumValueBaht, type AgeBand } from "@/lib/backlog-selectors"
import type { BacklogAlert, BacklogQueueSummary, BacklogRow } from "@/api/types"

const ALL = "__all__"
const PAGE_SIZE = 50
const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number | null) => (n === null ? "-" : n.toLocaleString("th-TH", { maximumFractionDigits: 0 }))

// One icon per queue number of the sheet's six queues; any other number gets the generic one.
const QUEUE_ICONS: Record<number, React.ComponentType<{ className?: string }>> = {
  1: PackageCheck,
  2: PackageX,
  3: ArchiveRestore,
  4: Truck,
  5: AlertTriangle,
  6: Banknote,
}

const BAND_CLASS: Record<AgeBand, string> = {
  none: "bg-muted text-muted-foreground",
  ok: "bg-emerald-glow/15 text-emerald-glow",
  warn: "bg-amber-500/15 text-amber-500",
  bad: "bg-destructive/15 text-destructive",
}

function AgeChip({ days }: { days: number | null }) {
  return (
    <span
      className={cn(
        "inline-block min-w-10 whitespace-nowrap rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums",
        BAND_CLASS[ageBand(days)]
      )}
    >
      {days === null ? "-" : `${num(days)} วัน`}
    </span>
  )
}

/** "งานค้าง": the team's daily to-do page from the gv-returns-sync workbook — cancelled and
 * returned parcels that still need someone. One tab per queue, named exactly as the sheet
 * names it and explained in the sheet's own words. Read-only: the sheet drops a line by itself
 * once the case is handled, so there is nothing to tick here. */
export function Backlog() {
  const { data, isLoading, isError, error } = useFocusQuery()
  const report = data?.focus ?? null
  const rows = useMemo(() => sortByAge(report?.rows ?? []), [report])

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const queues = report?.queues ?? []
  const sheetAlerts = report?.alerts ?? []
  const totalOrders = queues.reduce((sum, q) => sum + q.orders, 0)
  const oldest = queues.reduce((max, q) => Math.max(max, q.oldestDays ?? 0), 0)
  const overdue = alertCount(sheetAlerts, "เลยกำหนด")
  const dueToday = alertCount(sheetAlerts, "ครบกำหนดวันนี้")

  return (
    <div className="space-y-4">
      {(!report || report.error || report.missingTab) && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">ยังอ่านหน้างานค้างจากชีต gv-returns-sync ไม่ได้</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {!report
                ? "ยังไม่มีข้อมูลนี้ใน payload — รอระบบหลังบ้านอัปเดต (deploy Apps Script เวอร์ชันล่าสุด)"
                : report.error
                  ? `สาเหตุ: ${report.error}`
                  : `ไม่พบแท็บ: ${report.missingTab}`}
            </p>
          </div>
        </div>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        งานยกเลิก/ตีกลับ/ของคืนที่ยังค้าง แยกเป็นคิวตามแท็บ "โฟกัสทีม-งานค้าง" ของชีต gv-returns-sync · แถวจะหายเองเมื่อจัดการเสร็จ (ไม่มีช่องให้กรอกในหน้านี้)
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          title="มูลค่าค้างรวม"
          value={report?.totalValue ?? null}
          icon={Banknote}
          gradient="bg-gradient-to-br from-brand-500 to-brand-700"
          suffix="บาท"
          formatValue={(n) => baht(n)}
        />
        <KpiCard
          title="ออเดอร์ที่ค้าง"
          value={totalOrders}
          icon={ListChecks}
          gradient="bg-gradient-to-br from-sky-500 to-brand-600"
          suffix="ออเดอร์"
          subtitle={`${num(report?.rows.length ?? 0)} แถว (SKU)`}
        />
        <KpiCard
          title="เลยกำหนดแล้ว"
          value={overdue}
          icon={AlertTriangle}
          gradient="bg-gradient-to-br from-rose-500 to-destructive"
          suffix="รายการ"
          subtitle={`ครบกำหนดวันนี้ ${num(dueToday)}`}
        />
        <KpiCard
          title="ค้างนานสุด"
          value={oldest}
          icon={Hourglass}
          gradient="bg-gradient-to-br from-amber-500 to-rose-500"
          suffix="วัน"
        />
      </div>

      {sheetAlerts.length > 0 && (
        <div className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <span className="text-xs font-semibold text-muted-foreground">เตือนกำหนดดำเนินการ:</span>
          {sheetAlerts.map((a) => (
            <span
              key={a.label}
              className={cn(
                "rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground",
                a.nested && "ml-2 text-muted-foreground"
              )}
            >
              {a.label} <b className="tabular-nums">{num(a.count)}</b>
            </span>
          ))}
        </div>
      )}

      <Tabs
        items={[
          {
            key: "all",
            label: `ทุกคิว (${num(rows.length)})`,
            icon: ListChecks,
            render: () => <BacklogView key="all" rows={rows} />,
          },
          ...queues.map((q) => {
            const queueRows = rows.filter((r) => r.queueNo === q.queueNo)
            return {
              key: `queue-${q.queueNo}`,
              label: `${q.queue} (${num(queueRows.length)})`,
              icon: QUEUE_ICONS[q.queueNo] ?? ListChecks,
              render: () => <BacklogView key={`queue-${q.queueNo}`} rows={queueRows} summary={q} />,
            }
          }),
        ]}
      />
    </div>
  )
}

function alertCount(alerts: BacklogAlert[], needle: string): number {
  const found = alerts.find((a) => !a.nested && a.label.includes(needle))
  return found?.count ?? 0
}

function BacklogView({ rows, summary }: { rows: BacklogRow[]; summary?: BacklogQueueSummary }) {
  const [channel, setChannel] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [alert, setAlert] = useState(ALL)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [channel, owner, alert, search])

  const channels = useMemo(() => distinctTexts(rows, (r) => r.channel), [rows])
  const owners = useMemo(() => distinctTexts(rows, (r) => r.owner), [rows])
  const alerts = useMemo(() => distinctTexts(rows, (r) => r.alert), [rows])
  const query = search.trim().toLowerCase()

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (channel !== ALL && r.channel !== channel) return false
        if (owner !== ALL && r.owner !== owner) return false
        if (alert !== ALL && r.alert !== alert) return false
        if (query && !`${r.orderNo} ${r.packageNo} ${r.tracking} ${r.sku}`.toLowerCase().includes(query)) return false
        return true
      }),
    [rows, channel, owner, alert, query]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const activeFilterCount = [channel !== ALL, owner !== ALL, alert !== ALL, !!query].filter(Boolean).length
  const clearFilters = () => {
    setChannel(ALL)
    setOwner(ALL)
    setAlert(ALL)
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
      {summary && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-extrabold text-foreground">{summary.queue}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">ค้างนานสุด</span>
              <AgeChip days={summary.oldestDays} />
            </div>
          </div>
          {summary.meaning && <p className="mt-1 text-sm text-muted-foreground">{summary.meaning}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            <b className="tabular-nums text-foreground">{num(summary.orders)}</b> ออเดอร์ · <b className="tabular-nums text-foreground">{num(summary.lines)}</b> แถว ·
            มูลค่าค้าง <b className="tabular-nums text-foreground">{baht(summary.valueBaht)}</b> บาท · ฝ่ายที่ดูแล: {summary.owner || "-"}
          </p>
        </div>
      )}

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
          <label className="mb-1 block text-[11px] text-muted-foreground">ฝ่ายที่ดูแล</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {owners.map((o) => (
              <option key={o} value={o} className="bg-popover text-popover-foreground">{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">เตือน</label>
          <select value={alert} onChange={(e) => setAlert(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {alerts.map((a) => (
              <option key={a} value={a} className="bg-popover text-popover-foreground">{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <div className="section-title mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold tracking-wide text-foreground">รายการงานค้าง{summary ? ` · ${summary.queue}` : ""}</h3>
            <p className="text-[11px] text-muted-foreground">
              แสดง {num(pageRows.length ? pageStart + 1 : 0)}-{num(pageStart + pageRows.length)} จาก {num(filtered.length)} รายการ (ทั้งหมด {num(rows.length)}) · มูลค่าที่แสดง {baht(sumValueBaht(filtered))} บาท · เรียงจากค้างนานสุด
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="ค้นหาเลขออเดอร์ package แทร็คกิ้ง หรือ SKU"
              placeholder="ค้นหา ออเดอร์ / package / แทร็คกิ้ง / SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "w-64 rounded-full border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground",
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
              build={() => backlogReport(filtered)}
            />
          </div>
        </div>

        <table className="w-full min-w-[1150px] text-left text-sm [&_td]:px-2 [&_th]:px-2">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">ค้างมาแล้ว</th>
              <th className="pb-2 font-medium">คิว</th>
              <th className="pb-2 font-medium">ช่องทาง</th>
              <th className="pb-2 font-medium">ออเดอร์ / package</th>
              <th className="pb-2 font-medium">SKU</th>
              <th className="pb-2 text-right font-medium">ชิ้น</th>
              <th className="pb-2 font-medium">สถานะคืน / Stock-In</th>
              <th className="pb-2 font-medium">กำหนดดำเนินการ</th>
              <th className="pb-2 text-right font-medium">มูลค่า (฿)</th>
              <th className="pb-2 font-medium">ฝ่ายที่ดูแล</th>
              <th className="pb-2 font-medium">เหตุผลยกเลิก</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <BacklogTableRow key={`${r.packageNo}-${r.sku}-${pageStart + i}`} row={r} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-muted-foreground">
                  {rows.length > 0 ? "ไม่มีรายการตามเงื่อนไขที่เลือก" : "ไม่มีงานค้างในคิวนี้"}
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
          สีช่อง "ค้างมาแล้ว": <b className="text-emerald-glow">เขียว</b> = 0-3 วัน · <b className="text-amber-500">เหลือง</b> = 4-14 วัน ·{" "}
          <b className="text-destructive">แดง</b> = เกิน 14 วัน ตามก่อน · แถวจากรายงาน cn-restock ไม่มีวันที่เริ่มเรื่อง จึงแสดง "-"
        </p>
      </div>
    </div>
  )
}

function BacklogTableRow({ row: r }: { row: BacklogRow }) {
  return (
    <tr className="border-b border-white/5 align-top last:border-0 hover:bg-white/5">
      <td className="py-2.5 whitespace-nowrap">
        <AgeChip days={r.ageDays} />
        {r.startedOn && <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{r.startedOn}</div>}
      </td>
      <td className="py-2.5 text-xs text-foreground">{r.queue}</td>
      <td className="py-2.5">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{r.channel || "-"}</span>
      </td>
      <td className="py-2.5">
        <div className="font-medium text-foreground">{r.orderNo || "-"}</div>
        <div className="text-[11px] text-muted-foreground">{r.packageNo || "-"}</div>
      </td>
      <td className="py-2.5 text-muted-foreground">{r.sku || "-"}</td>
      <td className="py-2.5 text-right tabular-nums">{num(r.qty)}</td>
      <td className="py-2.5 text-xs">
        <div className="text-foreground">{r.returnStatus && r.returnStatus !== "-" ? r.returnStatus : "-"}</div>
        <div className="text-muted-foreground">{r.stockInStatus || "-"}</div>
      </td>
      <td className="py-2.5 text-xs">
        <div className="tabular-nums text-foreground">{r.dueDate || "-"}</div>
        {r.timeLeft && r.timeLeft !== "-" && <div className="text-muted-foreground">{r.timeLeft}</div>}
        {r.alert && <div className="font-semibold text-destructive">{r.alert}</div>}
      </td>
      <td className="py-2.5 text-right tabular-nums">{baht(r.valueBaht)}</td>
      <td className="py-2.5 text-xs text-foreground">{r.owner || "-"}</td>
      <td className="py-2.5 text-xs text-muted-foreground">{r.cancelReason && r.cancelReason !== "-" ? r.cancelReason : "-"}</td>
    </tr>
  )
}
