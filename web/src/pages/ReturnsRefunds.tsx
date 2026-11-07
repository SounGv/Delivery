import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Banknote, CheckCircle2, Clock, Layers, PackageX, Tag, Truck } from "lucide-react"
import { useRefundsQuery, useRestockQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { ExportButton } from "@/components/common/ExportButton"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import {
  FilterField,
  ListToolbar,
  Pager,
  ReturnRowCard,
  StatusPill,
  StatusTile,
  chipClass,
  filterSelectClass,
} from "@/components/returns/ReturnsUi"
import {
  carrierFromTracking,
  distinctRefundTexts,
  isRefundPaid,
  refundTotalsOf,
  sortRefundCases,
  trackingByPackage,
} from "@/lib/refund-selectors"
import { refundCasesReport } from "@/lib/reportExports"
import type { RefundCase, RefundSummaryRow } from "@/api/types"

const ALL = "__all__"
const PAID = "__paid__"
const UNPAID = "__unpaid__"
const LOST = "สูญหาย"
const PAGE_SIZE = 30
const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number | null) => (n === null ? "-" : n.toLocaleString("th-TH", { maximumFractionDigits: 0 }))

/** "สูญหาย / เงินคืน": lost and bounced parcels with the team's verdict on whether the carrier's
 * money came back, straight from the gv-returns-sync tab "ได้เงินคืนแล้ว-พัสดุหาย". The return
 * tracking number is joined from the cn-restock lines by package number; the carrier name is
 * read off that number (see carrierFromTracking), so both are blank when there is no number or
 * the prefix is unknown. Read-only. */
export function RefundsView() {
  const { data, isLoading, isError, error } = useRefundsQuery()
  const { data: restockData } = useRestockQuery()
  const report = data?.refunds ?? null
  const rows = useMemo(() => sortRefundCases(report?.rows ?? []), [report])
  const trackingMap = useMemo(() => trackingByPackage(restockData?.restock?.rows ?? []), [restockData])
  const trackingOf = (r: RefundCase) => trackingMap.get(r.packageNo) ?? ""

  const [verdict, setVerdict] = useState(ALL)
  const [lostOnly, setLostOnly] = useState(false)
  const [channel, setChannel] = useState(ALL)
  const [store, setStore] = useState(ALL)
  const [platformStatus, setPlatformStatus] = useState(ALL)
  const [carrier, setCarrier] = useState(ALL)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [verdict, lostOnly, channel, store, platformStatus, carrier, search])

  const channels = useMemo(() => distinctRefundTexts(rows, (r) => r.channel), [rows])
  const stores = useMemo(() => distinctRefundTexts(rows, (r) => r.store), [rows])
  const platformStatuses = useMemo(() => distinctRefundTexts(rows, (r) => r.platformStatus), [rows])
  const carriers = useMemo(
    () => distinctRefundTexts(rows, (r) => carrierFromTracking(trackingMap.get(r.packageNo) ?? "")),
    [rows, trackingMap]
  )
  const query = search.trim().toLowerCase()

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const tracking = trackingMap.get(r.packageNo) ?? ""
        if (verdict === PAID && !isRefundPaid(r)) return false
        if (verdict === UNPAID && isRefundPaid(r)) return false
        if (lostOnly && r.platformStatus !== LOST) return false
        if (channel !== ALL && r.channel !== channel) return false
        if (store !== ALL && r.store !== store) return false
        if (platformStatus !== ALL && r.platformStatus !== platformStatus) return false
        if (carrier !== ALL && carrierFromTracking(tracking) !== carrier) return false
        if (query && !`${r.orderNo} ${r.packageNo} ${tracking} ${r.sku} ${r.teamNote}`.toLowerCase().includes(query)) return false
        return true
      }),
    [rows, trackingMap, verdict, lostOnly, channel, store, platformStatus, carrier, query]
  )

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const paidRows = rows.filter(isRefundPaid)
  const unpaidRows = rows.filter((r) => !isRefundPaid(r))
  const lostRows = rows.filter((r) => r.platformStatus === LOST)
  const allTotals = refundTotalsOf(rows)
  const paidTotals = refundTotalsOf(paidRows)
  const unpaidTotals = refundTotalsOf(unpaidRows)
  const lostTotals = refundTotalsOf(lostRows)
  const sheetSummary = (needle: string): RefundSummaryRow | undefined => report?.summary.find((s) => s.label.includes(needle))
  const paidSheet = sheetSummary("ได้เงินคืนแล้ว")
  const waitingSheet = sheetSummary("รอเงินคืน")

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const activeCount = [verdict !== ALL, lostOnly, channel !== ALL, store !== ALL, platformStatus !== ALL, carrier !== ALL, !!query].filter(Boolean).length
  const clear = () => {
    setVerdict(ALL)
    setLostOnly(false)
    setChannel(ALL)
    setStore(ALL)
    setPlatformStatus(ALL)
    setCarrier(ALL)
    setSearch("")
  }

  return (
    <div className="space-y-4">
      {(!report || report.error || report.missingTab) && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">ยังอ่านแท็บ "ได้เงินคืนแล้ว-พัสดุหาย" จากชีต gv-returns-sync ไม่ได้</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {!report ? "ยังไม่มีข้อมูลนี้ใน payload — รอระบบหลังบ้านอัปเดต" : report.error ? `สาเหตุ: ${report.error}` : `ไม่พบแท็บ: ${report.missingTab}`}
            </p>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-extrabold text-foreground">พัสดุสูญหาย / ตีกลับ — ได้เงินคืนหรือยัง</h2>
        <p className="text-xs text-muted-foreground">
          ตามแท็บ "ได้เงินคืนแล้ว-พัสดุหาย" ของชีต gv-returns-sync · ทีมคลังบันทึกใน BigSeller ด้วยข้อความหรือป้ายสี · เลขพัสดุคืนมาจากแท็บ cn-restock ·
          ชื่อขนส่งดูจากรูปแบบเลขพัสดุคืน (ไม่ใช่ข้อมูลที่ BigSeller ส่งมา) · กดการ์ดสถานะเพื่อกรอง
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusTile
          tone="neutral"
          icon={Layers}
          label="ทั้งหมด"
          count={allTotals.rows}
          unit="รายการ"
          sub={`${num(allTotals.orders)} ออเดอร์ · ราคาขาย ฿${baht(allTotals.sellPrice)}`}
          active={verdict === ALL && !lostOnly}
          onClick={() => {
            setVerdict(ALL)
            setLostOnly(false)
          }}
        />
        <StatusTile
          tone="warn"
          icon={Clock}
          label="ยังไม่ได้เงินคืน"
          count={waitingSheet?.items ?? unpaidTotals.rows}
          unit="รายการ"
          sub={`${num(waitingSheet?.orders ?? unpaidTotals.orders)} ออเดอร์ · รอเงินคืนจากขนส่ง · ราคาขาย ฿${baht(waitingSheet?.sellPrice ?? unpaidTotals.sellPrice)}`}
          active={verdict === UNPAID}
          onClick={() => setVerdict(verdict === UNPAID ? ALL : UNPAID)}
        />
        <StatusTile
          tone="ok"
          icon={CheckCircle2}
          label="ได้เงินคืนแล้ว"
          count={paidSheet?.items ?? paidTotals.rows}
          unit="รายการ"
          sub={`${num(paidSheet?.orders ?? paidTotals.orders)} ออเดอร์ · ทีมระบุว่าได้คืน ฿${baht(paidSheet?.refunded ?? paidTotals.refunded)}`}
          active={verdict === PAID}
          onClick={() => setVerdict(verdict === PAID ? ALL : PAID)}
        />
        <StatusTile
          tone="danger"
          icon={PackageX}
          label='สถานะ "สูญหาย"'
          count={lostTotals.rows}
          unit="รายการ"
          sub={`${num(lostTotals.orders)} ออเดอร์ · ยังไม่ได้เงินคืน ${num(lostRows.filter((r) => !isRefundPaid(r)).length)} รายการ`}
          active={lostOnly}
          onClick={() => setLostOnly((v) => !v)}
        />
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="ค้นหา ออเดอร์ / พัสดุ / เลขพัสดุคืน / SKU / ข้อความทีม"
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
            <FilterField label="ร้านค้า">
              <select value={store} onChange={(e) => setStore(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทุกร้านค้า</option>
                {stores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="สถานะคืนของ (จากแพลตฟอร์ม)">
              <select value={platformStatus} onChange={(e) => setPlatformStatus(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                {platformStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="ขนส่ง (ดูจากเลขพัสดุคืน)">
              <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                {carriers.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
          </>
        }
        activeCount={activeCount}
        onClear={clear}
        actions={<ExportButton disabled={filtered.length === 0} label={`ส่งออก ${num(filtered.length)} รายการ`} build={() => refundCasesReport(filtered, trackingOf)} />}
      />

      <p className="px-1 text-xs text-muted-foreground">
        แสดง {num(pageRows.length ? pageStart + 1 : 0)}-{num(pageStart + pageRows.length)} จาก {num(filtered.length)} รายการ (ทั้งหมด {num(rows.length)}) · เรียงยังไม่ได้เงินคืนขึ้นก่อน
      </p>

      <div className="space-y-2.5">
        {pageRows.map((r, i) => (
          <RefundCard key={`${r.packageNo}-${r.sku}-${pageStart + i}`} row={r} tracking={trackingMap.get(r.packageNo) ?? ""} />
        ))}
        {filtered.length === 0 && (
          <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {rows.length > 0 ? "ไม่มีรายการตามเงื่อนไขที่เลือก — ลองกด ล้างตัวกรอง" : "ไม่มีรายการ"}
          </div>
        )}
      </div>

      <Pager page={pageSafe} totalPages={totalPages} onChange={setPage} />
    </div>
  )
}

function RefundCard({ row: r, tracking }: { row: RefundCase; tracking: string }) {
  const paid = isRefundPaid(r)
  const lost = r.platformStatus === LOST
  const carrier = carrierFromTracking(tracking)

  return (
    <ReturnRowCard
      tone={paid ? "ok" : "warn"}
      status={
        <>
          <StatusPill tone={paid ? "ok" : "warn"} icon={paid ? CheckCircle2 : Clock}>
            {paid ? "ได้เงินคืนแล้ว" : "ยังไม่ได้เงินคืน"}
          </StatusPill>
          {lost && (
            <StatusPill tone="danger" icon={PackageX}>
              สูญหาย
            </StatusPill>
          )}
          {!paid && r.caseResult && <p className="w-full text-[11px] text-muted-foreground">{r.caseResult}</p>}
          <p className="w-full text-[11px] text-muted-foreground">
            {!lost && r.platformStatus ? `${r.platformStatus} · ` : ""}
            {r.stockInStatus || "-"}
          </p>
        </>
      }
      item={
        <>
          <p className="text-sm font-semibold text-foreground">{r.sku || "-"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">จำนวน {num(r.qty)} ชิ้น</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{r.channel || "-"}</span>
            <span className="text-muted-foreground">{r.store || "-"}</span>
          </p>
        </>
      }
      refs={
        <dl className="space-y-0.5">
          <div className="flex gap-1.5">
            <dt className="w-12 shrink-0 text-muted-foreground">ออเดอร์</dt>
            <dd className="break-all font-medium text-foreground">{r.orderNo || "-"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="w-12 shrink-0 text-muted-foreground">พัสดุ</dt>
            <dd className="break-all text-foreground">{r.packageNo || "-"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="w-12 shrink-0 text-muted-foreground">พัสดุคืน</dt>
            <dd className="break-all text-foreground">
              {tracking || <span className="text-muted-foreground">-</span>}
              {carrier && (
                <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                  <Truck className="size-3" />
                  {carrier}
                </span>
              )}
            </dd>
          </div>
        </dl>
      }
      dates={
        <div className="space-y-0.5 text-muted-foreground">
          {r.knownFrom && <p>รู้จาก: <span className="text-foreground">{r.knownFrom}</span></p>}
          {r.colorLabel && (
            <p className="flex items-start gap-1">
              <Tag className="mt-0.5 size-3 shrink-0" />
              <span className="text-foreground">{r.colorLabel}</span>
            </p>
          )}
        </div>
      }
      money={
        <div>
          <p className="flex items-center gap-1 text-base font-extrabold tabular-nums text-foreground lg:justify-end">
            <Banknote className="size-4 text-muted-foreground" />฿{baht(r.sellPrice)}
          </p>
          <p className="text-muted-foreground">ราคาขาย</p>
          {r.refunded !== null && <p className="mt-0.5 font-semibold text-emerald-700 dark:text-emerald-300">ทีมระบุได้คืน ฿{baht(r.refunded)}</p>}
          {r.teamNote && (
            <p className="mt-1 line-clamp-3 whitespace-pre-line rounded-md bg-muted/60 px-2 py-1 text-left text-[11px] text-foreground" title={r.teamNote}>
              {r.teamNote}
            </p>
          )}
        </div>
      }
    />
  )
}
