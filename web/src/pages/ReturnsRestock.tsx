import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Banknote, Clock, PackageX, PackageSearch } from "lucide-react"
import { useRestockQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { ExportButton } from "@/components/common/ExportButton"
import { restockReport } from "@/lib/reportExports"
import { cn } from "@/lib/utils"
import {
  RESTOCK_STOCK_IN_STATUSES,
  distinctRestockTexts,
  isRefundNoted,
  sortByRequestedAt,
  totalsByStockIn,
  totalsOf,
} from "@/lib/restock-selectors"
import type { RestockRow } from "@/api/types"

const ALL = "__all__"
const NOTE_REFUND = "__refund__"
const NOTE_ANY = "__any__"
const NOTE_NONE = "__none__"
const LOST = "สูญหาย"
const PAGE_SIZE = 50
const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 })

const FALLBACK_STATUS_STYLE = { icon: Clock, gradient: "bg-gradient-to-br from-amber-500 to-rose-500" }
// One card style per Stock-In status, in the sheet's order (ยังไม่ / บางส่วน / ไม่).
const STATUS_STYLES = [
  FALLBACK_STATUS_STYLE,
  { icon: PackageSearch, gradient: "bg-gradient-to-br from-sky-500 to-brand-600" },
  { icon: Banknote, gradient: "bg-gradient-to-br from-rose-500 to-destructive" },
]

/** "สินค้าตีกลับ" as the gv-returns-sync workbook counts it (its "cn-restock" tab): every
 * return/bounce that is not fully stocked in yet, including cancelled orders and abnormal
 * bounces. Headings and statuses are the sheet's own, so the totals can be checked against
 * its "สรุป-cn-restock" tab line by line. Read-only. */
export function RestockView() {
  const { data, isLoading, isError, error } = useRestockQuery()
  const report = data?.restock ?? null
  const rows = useMemo(() => sortByRequestedAt(report?.rows ?? []), [report])

  const [platform, setPlatform] = useState(ALL)
  const [store, setStore] = useState(ALL)
  const [stockIn, setStockIn] = useState(ALL)
  const [orderStatus, setOrderStatus] = useState(ALL)
  const [returnStatus, setReturnStatus] = useState(ALL)
  const [origin, setOrigin] = useState(ALL)
  const [note, setNote] = useState(ALL)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [platform, store, stockIn, orderStatus, returnStatus, origin, note, search])

  const platforms = useMemo(() => distinctRestockTexts(rows, (r) => r.platform), [rows])
  const stores = useMemo(() => distinctRestockTexts(rows, (r) => r.store), [rows])
  const stockInStatuses = useMemo(() => distinctRestockTexts(rows, (r) => r.stockInStatus), [rows])
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
        if (orderStatus !== ALL && r.orderStatus !== orderStatus) return false
        if (returnStatus !== ALL && r.returnStatus !== returnStatus) return false
        if (origin !== ALL && r.origin !== origin) return false
        if (note === NOTE_REFUND && !isRefundNoted(r)) return false
        if (note === NOTE_ANY && !r.stockInNote) return false
        if (note === NOTE_NONE && r.stockInNote) return false
        if (
          query &&
          !`${r.orderNo} ${r.packageNo} ${r.returnTracking} ${r.sku} ${r.productName} ${r.stockInNote}`.toLowerCase().includes(query)
        )
          return false
        return true
      }),
    [rows, platform, store, stockIn, orderStatus, returnStatus, origin, note, query]
  )

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const all = totalsOf(rows)
  const byStockIn = totalsByStockIn(rows)
  const statusOrder = [...RESTOCK_STOCK_IN_STATUSES, ...[...byStockIn.keys()].filter((k) => !RESTOCK_STOCK_IN_STATUSES.includes(k))]

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const activeFilterCount = [
    platform !== ALL,
    store !== ALL,
    stockIn !== ALL,
    orderStatus !== ALL,
    returnStatus !== ALL,
    origin !== ALL,
    note !== ALL,
    !!query,
  ].filter(Boolean).length
  const clearFilters = () => {
    setPlatform(ALL)
    setStore(ALL)
    setStockIn(ALL)
    setOrderStatus(ALL)
    setReturnStatus(ALL)
    setOrigin(ALL)
    setNote(ALL)
    setSearch("")
  }
  const lostRows = rows.filter((r) => r.returnStatus === LOST)
  const lostTotals = totalsOf(lostRows)
  const refundNotedRows = rows.filter(isRefundNoted)
  const refundNotedTotals = totalsOf(refundNotedRows)
  const selectCls =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm outline-none hover:bg-muted"
  const pillCls = (active: boolean) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
      active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"
    )
  const subtitleOf = (t: { orders: number; qty: number; refundAmount: number }) =>
    `${num(t.orders)} ออเดอร์ · ${num(t.qty)} ชิ้น · ยอดคืนเงิน ${baht(t.refundAmount)} บาท`

  return (
    <div className="space-y-4">
      {(!report || report.error || report.missingTab) && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">ยังอ่านแท็บ cn-restock จากชีต gv-returns-sync ไม่ได้</p>
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
        รายการคืนสินค้า/ตีกลับที่ยังไม่เข้าสต็อกครบ (Stock-In) ตามแท็บ "cn-restock" ของชีต gv-returns-sync · รวมออเดอร์ที่ยกเลิกและเคสตีกลับด้วย · ออเดอร์ = นับเลขคำสั่งซื้อไม่ซ้ำ · แถว = 1 SKU ต่อ 1 แถว
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="รวมทั้งหมด"
          value={all.rows}
          icon={PackageX}
          gradient="bg-gradient-to-br from-brand-500 to-brand-700"
          suffix="แถว (SKU)"
          subtitle={subtitleOf(all)}
        />
        {statusOrder.map((status, i) => {
          const t = byStockIn.get(status) ?? { orders: 0, rows: 0, qty: 0, refundAmount: 0 }
          const style = STATUS_STYLES[i % STATUS_STYLES.length] ?? FALLBACK_STATUS_STYLE
          return (
            <KpiCard
              key={status}
              title={status}
              value={t.rows}
              icon={style.icon}
              gradient={style.gradient}
              suffix="แถว (SKU)"
              subtitle={subtitleOf(t)}
            />
          )
        })}
      </div>

      <div className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <span className="text-xs font-semibold text-muted-foreground">ในรายการนี้ (กดเพื่อกรอง):</span>
        <button
          type="button"
          onClick={() => setReturnStatus(returnStatus === LOST ? ALL : LOST)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            returnStatus === LOST ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"
          )}
        >
          สถานะคืนสินค้า "สูญหาย" <b className="tabular-nums">{num(lostTotals.rows)}</b> แถว · {num(lostTotals.orders)} ออเดอร์
        </button>
        <button
          type="button"
          title='ตรวจจากข้อความที่ทีมพิมพ์ในช่อง "หมายเหตุ Stock-In" (มีคำว่า ได้เงิน / ได้รับเงิน) ไม่ใช่คอลัมน์สถานะ'
          onClick={() => setNote(note === NOTE_REFUND ? ALL : NOTE_REFUND)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            note === NOTE_REFUND ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"
          )}
        >
          หมายเหตุว่าได้เงินแล้ว <b className="tabular-nums">{num(refundNotedTotals.rows)}</b> แถว · {num(refundNotedTotals.orders)} ออเดอร์
        </button>
      </div>

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">แพลตฟอร์ม</label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setPlatform(ALL)} className={pillCls(platform === ALL)}>
              ทั้งหมด
            </button>
            {platforms.map((p) => (
              <button key={p} type="button" onClick={() => setPlatform(p)} className={pillCls(platform === p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">ร้านค้า BigSeller</label>
          <select value={store} onChange={(e) => setStore(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทุกร้านค้า</option>
            {stores.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">สถานะ Stock-In</label>
          <select value={stockIn} onChange={(e) => setStockIn(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {stockInStatuses.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">สถานะคำสั่งซื้อ</label>
          <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {orderStatuses.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">สถานะคืนสินค้า</label>
          <select value={returnStatus} onChange={(e) => setReturnStatus(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {returnStatuses.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">ที่มา</label>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {origins.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">หมายเหตุ Stock-In</label>
          <select value={note} onChange={(e) => setNote(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            <option value={NOTE_REFUND} className="bg-popover text-popover-foreground">หมายเหตุว่าได้เงินแล้ว</option>
            <option value={NOTE_ANY} className="bg-popover text-popover-foreground">มีหมายเหตุ</option>
            <option value={NOTE_NONE} className="bg-popover text-popover-foreground">ไม่มีหมายเหตุ</option>
          </select>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <div className="section-title mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold tracking-wide text-foreground">รายการ cn-restock</h3>
            <p className="text-[11px] text-muted-foreground">
              แสดง {num(pageRows.length ? pageStart + 1 : 0)}-{num(pageStart + pageRows.length)} จาก {num(filtered.length)} แถว (ทั้งหมด {num(rows.length)}) · เรียงจากยื่นบริการหลังการขายนานสุด
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="ค้นหาเลขคำสั่งซื้อ หมายเลขพัสดุ แทร็คกิ้ง หรือ SKU"
              placeholder="ค้นหา ออเดอร์ / พัสดุ / แทร็คกิ้ง / SKU"
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
              label={`ส่งออก ${num(filtered.length)} แถว`}
              build={() => restockReport(filtered)}
            />
          </div>
        </div>

        <table className="w-full min-w-[1450px] text-left text-sm [&_td]:px-2 [&_th]:px-2">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">เวลายื่นบริการหลังการขาย</th>
              <th className="pb-2 font-medium">แพลตฟอร์ม / ร้านค้า</th>
              <th className="pb-2 font-medium">หมายเลขคำสั่งซื้อ / พัสดุ</th>
              <th className="pb-2 font-medium">สินค้า</th>
              <th className="pb-2 text-right font-medium">จำนวน</th>
              <th className="pb-2 text-right font-medium">ยอดคืนเงิน</th>
              <th className="pb-2 font-medium">สถานะคำสั่งซื้อ / หลังการขาย</th>
              <th className="pb-2 font-medium">สถานะ Stock-In</th>
              <th className="pb-2 font-medium">สถานะคืนสินค้า</th>
              <th className="pb-2 font-medium">ฝ่ายที่ดูแล</th>
              <th className="pb-2 font-medium">ที่มา</th>
              <th className="pb-2 font-medium">หมายเหตุ Stock-In</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <RestockTableRow key={`${r.packageNo}-${r.sku}-${pageStart + i}`} row={r} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="py-8 text-center text-muted-foreground">
                  {rows.length > 0 ? "ไม่มีรายการตามเงื่อนไขที่เลือก" : "ไม่มีรายการค้าง"}
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
      </div>
    </div>
  )
}

function RestockTableRow({ row: r }: { row: RestockRow }) {
  return (
    <tr className="border-b border-white/5 align-top last:border-0 hover:bg-white/5">
      <td className="py-2.5 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{r.requestedAt || "-"}</td>
      <td className="py-2.5">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{r.platform || "-"}</span>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{r.store || "-"}</div>
      </td>
      <td className="py-2.5">
        <div className="font-medium text-foreground">{r.orderNo || "-"}</div>
        <div className="text-[11px] text-muted-foreground">{r.packageNo || "-"}</div>
        {r.returnTracking && <div className="text-[11px] text-muted-foreground">คืน: {r.returnTracking}</div>}
      </td>
      <td className="max-w-xs py-2.5">
        <div className="truncate text-xs text-foreground" title={r.productName}>{r.productName || "-"}</div>
        <div className="text-[11px] text-muted-foreground">{r.sku || "-"}</div>
      </td>
      <td className="py-2.5 text-right tabular-nums">{num(r.qty)}</td>
      <td className="py-2.5 text-right tabular-nums">{baht(r.refundAmount)}</td>
      <td className="py-2.5 text-xs">
        <div className="text-foreground">{r.orderStatus || "-"}</div>
        <div className="text-muted-foreground">{r.afterSalesStatus || "-"}</div>
      </td>
      <td className="py-2.5 text-xs">
        <div className="text-foreground">{r.stockInStatus || "-"}</div>
        <div className="text-muted-foreground">Stock-In แล้ว {num(r.stockInQty)} ชิ้น</div>
        {r.arrivedAt && <div className="text-[11px] tabular-nums text-muted-foreground">ถึงคลัง {r.arrivedAt}</div>}
      </td>
      <td className="py-2.5 text-xs text-foreground">{r.returnStatus && r.returnStatus !== "-" ? r.returnStatus : "-"}</td>
      <td className="py-2.5 text-xs text-foreground">{r.owner || "-"}</td>
      <td className="py-2.5 text-xs text-foreground">{r.origin || "-"}</td>
      <td className="max-w-[220px] whitespace-pre-line py-2.5 text-xs text-foreground">{r.stockInNote || "-"}</td>
    </tr>
  )
}
