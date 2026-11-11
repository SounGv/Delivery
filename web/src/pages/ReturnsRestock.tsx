import { ClampText } from "@/components/common/ClampText"
import { LIST_PAGE_SIZE } from "@/lib/page-size"
import { useEffect, useMemo, useState } from "react"
import { Banknote, CalendarClock, CheckCircle2, Clock, Layers, PackageSearch, PackageX, Truck, XCircle } from "lucide-react"
import { useRestockQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { ExportButton } from "@/components/common/ExportButton"
import { DataNotice } from "@/components/common/DataNotice"
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
  type Tone,
} from "@/components/returns/ReturnsUi"
import { ageBand } from "@/lib/backlog-selectors"
import { daysBetween } from "@/lib/cancelled-selectors"
import { carrierFromTracking } from "@/lib/refund-selectors"
import { restockReport } from "@/lib/reportExports"
import {
  RESTOCK_STOCK_IN_STATUSES,
  distinctRestockTexts,
  isRefundNoted,
  sortByRequestedAt,
  totalsByStockIn,
  totalsOf,
} from "@/lib/restock-selectors"
import { cn } from "@/lib/utils"
import type { RestockRow } from "@/api/types"

const ALL = "__all__"
const NOTE_REFUND = "__refund__"
const NOTE_ANY = "__any__"
const NOTE_NONE = "__none__"
const LOST = "สูญหาย"
const PAGE_SIZE = LIST_PAGE_SIZE
const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 })

const AGE_CLASS = {
  none: "text-muted-foreground",
  ok: "text-emerald-700 dark:text-emerald-300",
  warn: "text-amber-800 dark:text-amber-300",
  bad: "text-rose-700 dark:text-rose-300",
}

/** Stock-In status -> the page's status colour (see ReturnsUi). */
function stockInTone(status: string): Tone {
  if (status === "ไม่ Stock-In") return "danger"
  if (status === "ยังไม่ Stock-In") return "warn"
  if (status === "Stock-In บางส่วน") return "info"
  return "ok"
}

const STOCK_IN_ICON = { danger: XCircle, warn: Clock, info: PackageSearch, ok: CheckCircle2, neutral: Clock }

/** "สินค้าตีกลับ" as the gv-returns-sync workbook counts it (its "cn-restock" tab): every
 * return/bounce not fully stocked in yet, cancelled orders and abnormal bounces included.
 * Headings and statuses are the sheet's own, so the totals can be checked against its
 * "สรุป-cn-restock" tab line by line. Read-only. */
export function RestockView() {
  const { data, isLoading, isError, error } = useRestockQuery()
  const report = data?.restock ?? null
  const rows = useMemo(() => sortByRequestedAt(report?.rows ?? []), [report])

  const [platform, setPlatform] = useState(ALL)
  const [store, setStore] = useState(ALL)
  const [stockIn, setStockIn] = useState(ALL)
  const [lostOnly, setLostOnly] = useState(false)
  const [refundOnly, setRefundOnly] = useState(false)
  const [orderStatus, setOrderStatus] = useState(ALL)
  const [returnStatus, setReturnStatus] = useState(ALL)
  const [origin, setOrigin] = useState(ALL)
  const [note, setNote] = useState(ALL)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [platform, store, stockIn, lostOnly, refundOnly, orderStatus, returnStatus, origin, note, search])

  const platforms = useMemo(() => distinctRestockTexts(rows, (r) => r.platform), [rows])
  const stores = useMemo(() => distinctRestockTexts(rows, (r) => r.store), [rows])
  const orderStatuses = useMemo(() => distinctRestockTexts(rows, (r) => r.orderStatus), [rows])
  const returnStatuses = useMemo(() => distinctRestockTexts(rows, (r) => r.returnStatus), [rows])
  const origins = useMemo(() => distinctRestockTexts(rows, (r) => r.origin), [rows])
  const query = search.trim().toLowerCase()

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (platform !== ALL && r.platform !== platform) return false
        if (store !== ALL && r.store !== store) return false
        if (stockIn !== ALL && r.stockInStatus !== stockIn) return false
        if (lostOnly && r.returnStatus !== LOST) return false
        if (refundOnly && !isRefundNoted(r)) return false
        if (orderStatus !== ALL && r.orderStatus !== orderStatus) return false
        if (returnStatus !== ALL && r.returnStatus !== returnStatus) return false
        if (origin !== ALL && r.origin !== origin) return false
        if (note === NOTE_REFUND && !isRefundNoted(r)) return false
        if (note === NOTE_ANY && !r.stockInNote) return false
        if (note === NOTE_NONE && r.stockInNote) return false
        if (query && !`${r.orderNo} ${r.packageNo} ${r.returnTracking} ${r.sku} ${r.productName} ${r.stockInNote}`.toLowerCase().includes(query))
          return false
        return true
      }),
    [rows, platform, store, stockIn, lostOnly, refundOnly, orderStatus, returnStatus, origin, note, query]
  )

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const todayIso = data.todayDate
  const all = totalsOf(rows)
  const byStockIn = totalsByStockIn(rows)
  const statusOrder = [...RESTOCK_STOCK_IN_STATUSES, ...[...byStockIn.keys()].filter((k) => !RESTOCK_STOCK_IN_STATUSES.includes(k))]
  const lostTotals = totalsOf(rows.filter((r) => r.returnStatus === LOST))
  const refundTotals = totalsOf(rows.filter(isRefundNoted))
  const subOf = (t: { orders: number; qty: number; refundAmount: number }) =>
    `${num(t.orders)} ออเดอร์ · ${num(t.qty)} ชิ้น · ฿${baht(t.refundAmount)}`

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const activeCount = [platform !== ALL, store !== ALL, stockIn !== ALL, lostOnly, refundOnly, orderStatus !== ALL, returnStatus !== ALL, origin !== ALL, note !== ALL, !!query].filter(Boolean).length
  const clear = () => {
    setPlatform(ALL)
    setStore(ALL)
    setStockIn(ALL)
    setLostOnly(false)
    setRefundOnly(false)
    setOrderStatus(ALL)
    setReturnStatus(ALL)
    setOrigin(ALL)
    setNote(ALL)
    setSearch("")
  }

  return (
    <div className="space-y-4">
      {(!report || report.error || report.missingTab) && (
        <DataNotice
          title="ยังอ่านข้อมูลของคืน/ตีกลับไม่ได้"
          detail={!report ? "ยังไม่มีข้อมูลส่วนนี้ใน payload" : report.error ? `สาเหตุ: ${report.error}` : `ไม่พบแท็บ: ${report.missingTab}`}
        />
      )}

      <div>
        <h2 className="page-heading text-lg font-extrabold text-foreground">ของคืน/ตีกลับ ที่ยังไม่เข้าสต็อกครบ</h2>
        <ClampText className="text-xs text-muted-foreground">
          รวมออเดอร์ที่ยกเลิกและเคสตีกลับ · 1 แถว = 1 SKU · กดการ์ดสถานะเพื่อกรอง · ที่มา: ชีต gv-returns-sync แท็บ "cn-restock"
        </ClampText>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusTile
          tone="neutral"
          icon={Layers}
          label="ทั้งหมด"
          count={all.rows}
          unit="แถว"
          sub={subOf(all)}
          active={stockIn === ALL && !lostOnly && !refundOnly}
          onClick={() => {
            setStockIn(ALL)
            setLostOnly(false)
            setRefundOnly(false)
          }}
        />
        {statusOrder.map((status) => {
          const tone = stockInTone(status)
          const t = byStockIn.get(status) ?? { orders: 0, rows: 0, qty: 0, refundAmount: 0 }
          return (
            <StatusTile
              key={status}
              tone={tone}
              icon={STOCK_IN_ICON[tone]}
              label={status}
              count={t.rows}
              unit="แถว"
              sub={subOf(t)}
              active={stockIn === status}
              onClick={() => setStockIn(stockIn === status ? ALL : status)}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatusTile
          tone="danger"
          icon={PackageX}
          label='สถานะคืนสินค้า "สูญหาย"'
          count={lostTotals.rows}
          unit="แถว"
          sub={subOf(lostTotals)}
          active={lostOnly}
          onClick={() => setLostOnly((v) => !v)}
        />
        <StatusTile
          tone="ok"
          icon={Banknote}
          label="หมายเหตุว่าได้เงินแล้ว"
          count={refundTotals.rows}
          unit="แถว"
          sub={`${subOf(refundTotals)} · ตรวจจากข้อความที่ทีมพิมพ์`}
          active={refundOnly}
          onClick={() => setRefundOnly((v) => !v)}
        />
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="ค้นหา ออเดอร์ / พัสดุ / เลขพัสดุคืน / SKU / หมายเหตุ"
        chips={
          <>
            <button type="button" onClick={() => setPlatform(ALL)} className={chipClass(platform === ALL)}>
              ทุกแพลตฟอร์ม
            </button>
            {platforms.map((p) => (
              <button key={p} type="button" onClick={() => setPlatform(p)} className={chipClass(platform === p)}>
                {p}
              </button>
            ))}
          </>
        }
        moreFilters={
          <>
            <FilterField label="ร้านค้า BigSeller">
              <select value={store} onChange={(e) => setStore(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทุกร้านค้า</option>
                {stores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="สถานะคำสั่งซื้อ">
              <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                {orderStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="สถานะคืนสินค้า">
              <select value={returnStatus} onChange={(e) => setReturnStatus(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                {returnStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="ที่มา">
              <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                {origins.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="หมายเหตุ Stock-In">
              <select value={note} onChange={(e) => setNote(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                <option value={NOTE_REFUND}>หมายเหตุว่าได้เงินแล้ว</option>
                <option value={NOTE_ANY}>มีหมายเหตุ</option>
                <option value={NOTE_NONE}>ไม่มีหมายเหตุ</option>
              </select>
            </FilterField>
          </>
        }
        activeCount={activeCount}
        onClear={clear}
        actions={<ExportButton disabled={filtered.length === 0} label={`ส่งออก ${num(filtered.length)} รายการ`} build={() => restockReport(filtered)} />}
      />

      <p className="px-1 text-xs text-muted-foreground">
        แสดง {num(pageRows.length ? pageStart + 1 : 0)}-{num(pageStart + pageRows.length)} จาก {num(filtered.length)} แถว (ทั้งหมด {num(rows.length)}) · เรียงจากยื่นเรื่องนานสุด
      </p>

      <div className="space-y-2.5">
        {pageRows.map((r, i) => (
          <RestockCard key={`${r.packageNo}-${r.sku}-${pageStart + i}`} row={r} todayIso={todayIso} />
        ))}
        {filtered.length === 0 && (
          <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {rows.length > 0 ? "ไม่มีรายการตามเงื่อนไขที่เลือก — ลองกด ล้างตัวกรอง" : "ไม่มีรายการค้าง"}
          </div>
        )}
      </div>

      <Pager page={pageSafe} totalPages={totalPages} onChange={setPage} />
    </div>
  )
}

function RestockCard({ row: r, todayIso }: { row: RestockRow; todayIso: string }) {
  const tone = stockInTone(r.stockInStatus)
  const StockInIcon = STOCK_IN_ICON[tone]
  const lost = r.returnStatus === LOST
  const refundNoted = isRefundNoted(r)
  const carrier = carrierFromTracking(r.returnTracking)
  const requestedDate = r.requestedAt.slice(0, 10)
  const age = requestedDate ? daysBetween(requestedDate, todayIso) : null

  return (
    <ReturnRowCard
      tone={tone}
      status={
        <>
          <StatusPill tone={tone} icon={StockInIcon}>
            {r.stockInStatus || "ไม่ระบุ"}
          </StatusPill>
          {lost && (
            <StatusPill tone="danger" icon={PackageX}>
              สูญหาย
            </StatusPill>
          )}
          {refundNoted && (
            <StatusPill tone="ok" icon={Banknote}>
              ได้เงินแล้ว
            </StatusPill>
          )}
          {r.orderStatus === "ยกเลิกแล้ว" && (
            <StatusPill tone="neutral" small>
              ยกเลิกแล้ว
            </StatusPill>
          )}
          <p className="w-full text-[11px] text-muted-foreground">
            {r.returnStatus && r.returnStatus !== "-" && !lost ? `${r.returnStatus} · ` : ""}
            Stock-In แล้ว {num(r.stockInQty)}/{num(r.qty)} ชิ้น
          </p>
        </>
      }
      item={
        <>
          <p className="line-clamp-2 text-sm font-semibold text-foreground" title={r.productName}>
            {r.productName || "-"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.sku || "-"} · {num(r.qty)} ชิ้น
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{r.platform || "-"}</span>
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
              {r.returnTracking || "-"}
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
        <div className="space-y-0.5">
          <p className="flex items-center gap-1 text-muted-foreground">
            <CalendarClock className="size-3.5" />
            ยื่น {requestedDate || "-"}
          </p>
          {age !== null && <p className={cn("text-sm font-extrabold tabular-nums", AGE_CLASS[ageBand(age)])}>ค้าง {num(age)} วัน</p>}
          {r.arrivedAt && <p className="text-muted-foreground">ถึงคลัง {r.arrivedAt.slice(0, 10)}</p>}
        </div>
      }
      money={
        <div>
          <p className="text-base font-extrabold tabular-nums text-foreground">฿{baht(r.refundAmount)}</p>
          <p className="text-muted-foreground">ยอดคืนเงิน</p>
          {r.stockInNote && (
            <p className="mt-1 line-clamp-3 whitespace-pre-line rounded-md bg-muted/60 px-2 py-1 text-left text-[11px] text-foreground" title={r.stockInNote}>
              {r.stockInNote}
            </p>
          )}
        </div>
      }
    />
  )
}
