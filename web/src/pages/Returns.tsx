import { useEffect, useMemo, useState } from "react"
import { ChevronRight, PackageX, Clock, AlertTriangle, Banknote, Scale, PackageSearch } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { ExportButton } from "@/components/common/ExportButton"
import { returnsReport } from "@/lib/reportExports"
import { cn } from "@/lib/utils"
import {
  breakdownByPlatform,
  breakdownByReason,
  computeReturnsTotals,
  distinctPlatforms,
  distinctStores,
  hasQtyDiscrepancy,
  isInTransit,
  isLost,
  isPendingRefundButton,
  isUrgent,
} from "@/lib/returns-selectors"
import type { ReturnRow } from "@/api/types"

const ALL = "__all__"
/** 5,473 rows and growing rendered unvirtualized made the page visibly slow to
 * load and scroll — this keeps the DOM small by only ever mounting one page of
 * table rows, while every KPI/breakdown stays computed over the full filtered
 * set above it (so numbers never silently reflect just the visible page). */
const PAGE_SIZE = 50
const money = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`
const num = (n: number) => n.toLocaleString("th-TH")

const PLATFORM_LABEL: Record<string, string> = { shopee: "Shopee", tiktok: "TikTok", lazada: "Lazada" }
const platformLabel = (p: string) => PLATFORM_LABEL[p] ?? p

/** Product-returns dashboard sourced from the "BIGSELLER_RAW" after-sales export
 * (every platform). See lib/returns-selectors.ts for what each derived flag
 * means — most status text here is the SHEET'S OWN pre-computed column
 * ("ธง"/"สถานะ"/"ปุ่มคืนเงินในแพลตฟอร์ม"), passed through rather than
 * recomputed, so this page never drifts from what staff see in the sheet. */
export function Returns() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const [platform, setPlatform] = useState(ALL)
  const [store, setStore] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const rows = useMemo(() => data?.returns?.rows ?? [], [data])

  useEffect(() => {
    setPage(1)
  }, [platform, store, statusFilter])

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const platforms = distinctPlatforms(rows)
  const stores = distinctStores(rows)
  const hasData = rows.length > 0

  const filtered = rows.filter((r) => {
    if (platform !== ALL && r.platform !== platform) return false
    if (store !== ALL && r.store !== store) return false
    if (statusFilter === "pending_refund" && !isPendingRefundButton(r)) return false
    if (statusFilter === "in_transit" && !isInTransit(r)) return false
    if (statusFilter === "urgent" && !isUrgent(r)) return false
    if (statusFilter === "lost" && !isLost(r)) return false
    if (statusFilter === "discrepancy" && !hasQtyDiscrepancy(r)) return false
    return true
  })

  const totals = computeReturnsTotals(filtered)
  const platformBreakdown = breakdownByPlatform(filtered)
  const reasonBreakdown = breakdownByReason(filtered)
  const maxPlatformCount = Math.max(1, ...platformBreakdown.map((p) => p.count))
  const maxReasonCount = Math.max(1, ...reasonBreakdown.map((r) => r.count))

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const toggleRow = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
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
      {!hasData && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">ยังไม่พบข้อมูลจากชีท "BIGSELLER_RAW"</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ระบบอ่านชีทคืนสินค้าแบบ read-only แต่ API ยังไม่ส่งข้อมูลนี้มา — ต้องอัปเดต Apps Script แล้ว Deploy → New version
            </p>
          </div>
        </div>
      )}

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">แพลตฟอร์ม</label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setPlatform(ALL)} className={pillCls(platform === ALL)}>
              ทั้งหมด
            </button>
            {platforms.map((p) => (
              <button key={p} type="button" onClick={() => setPlatform(p)} className={pillCls(platform === p)}>
                {platformLabel(p)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">ร้านค้า</label>
          <select value={store} onChange={(e) => setStore(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทุกร้านค้า</option>
            {stores.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">สถานะ</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value={ALL} className="bg-popover text-popover-foreground">ทั้งหมด</option>
            <option value="pending_refund" className="bg-popover text-popover-foreground">รอกดคืนเงินในแพลตฟอร์ม</option>
            <option value="in_transit" className="bg-popover text-popover-foreground">อยู่ระหว่างขนส่งขากลับ</option>
            <option value="urgent" className="bg-popover text-popover-foreground">เร่งด่วน ≤2 วัน</option>
            <option value="lost" className="bg-popover text-popover-foreground">สูญหาย</option>
            <option value="discrepancy" className="bg-popover text-popover-foreground">จำนวนไม่ตรง (ต้องคืน vs Stock-In)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="คำขอคืนทั้งหมด" value={totals.count} icon={PackageX} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="รายการ" />
        <KpiCard
          title="รอกดคืนเงินในแพลตฟอร์ม"
          value={totals.pendingRefundButtonCount}
          icon={Clock}
          gradient="bg-gradient-to-br from-amber-500 to-rose-500"
          suffix="รายการ"
          subtitle="สแกนรับแล้วแต่ยังไม่กดคืนเงิน (Shopee)"
        />
        <KpiCard title="อยู่ระหว่างขนส่งขากลับ" value={totals.inTransitCount} icon={PackageX} gradient="bg-gradient-to-br from-sky-500 to-brand-600" suffix="รายการ" />
        <KpiCard title="เร่งด่วน ≤2 วัน" value={totals.urgentCount} icon={AlertTriangle} gradient="bg-gradient-to-br from-rose-500 to-destructive" suffix="รายการ" />
        <KpiCard
          title="สูญหาย"
          value={totals.lostCount}
          icon={PackageSearch}
          gradient="bg-gradient-to-br from-destructive to-rose-700"
          suffix="รายการ"
          subtitle="พัสดุไม่กลับเข้าคลัง ไม่มีทางถึง Stock-In"
        />
        <KpiCard title="ยอดคืนเงินรวม" value={totals.totalRefundAmount} icon={Banknote} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" formatValue={(n) => `฿${Math.round(n).toLocaleString("th-TH")}`} />
      </div>

      {totals.discrepancyCount > 0 && (
        <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl border-amber-500/30 p-4 text-sm">
          <Scale className="size-5 shrink-0 text-amber-500" />
          <span className="text-foreground">
            ส่วนต่างจำนวนที่ต้องคืนกับ Stock-In จริง: <b className="text-amber-500">{num(totals.discrepancyCount)} รายการ</b>{" "}
            <span className="text-muted-foreground">ที่ยอด Stock-In ยังไม่เท่ากับจำนวนที่ต้องคืน (ของขาดหรือของเกิน)</span>
          </span>
          <button type="button" onClick={() => setStatusFilter("discrepancy")} className="ml-auto text-xs font-semibold text-primary hover:underline">
            ดูเฉพาะรายการที่ไม่ตรง →
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">แยกตามแพลตฟอร์ม</h3>
          <div className="space-y-2.5">
            {platformBreakdown.map((p) => (
              <div key={p.platform} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-xs font-semibold text-foreground">{platformLabel(p.platform)}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(p.count / maxPlatformCount) * 100}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  <b className="text-foreground">{num(p.count)}</b> รายการ · {money(p.refundAmount)}
                </span>
              </div>
            ))}
            {platformBreakdown.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีข้อมูล</p>}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">แยกตามสาเหตุ</h3>
          <div className="space-y-2.5">
            {reasonBreakdown.map((r) => (
              <div key={r.reason} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs font-semibold text-foreground">{r.reason}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-glow" style={{ width: `${(r.count / maxReasonCount) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  <b className="text-foreground">{num(r.count)}</b> รายการ
                </span>
              </div>
            ))}
            {reasonBreakdown.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีสาเหตุที่ระบุในรายการที่กรอง</p>}
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">รายการคืนสินค้า</h3>
          <ExportButton
            disabled={filtered.length === 0}
            label={`ส่งออก ${num(filtered.length)} รายการ`}
            build={() => returnsReport(filtered, platform === ALL ? "all" : platform)}
          />
          <span className="text-[11px] text-muted-foreground">
            แสดง {num(pageRows.length ? pageStart + 1 : 0)}-{num(pageStart + pageRows.length)} จาก {num(filtered.length)} รายการ
            (ทั้งหมด {num(rows.length)}) · คลิกแถวเพื่อดูรายละเอียดเพิ่มเติม
          </span>
        </div>
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="w-6 pb-2" />
              <th className="pb-2 font-medium">ร้านค้า</th>
              <th className="pb-2 font-medium">แพลตฟอร์ม</th>
              <th className="pb-2 font-medium">SKU</th>
              <th className="pb-2 text-right font-medium">ต้องคืน</th>
              <th className="pb-2 text-right font-medium">Stock-In</th>
              <th className="pb-2 font-medium">สถานะ</th>
              <th className="pb-2 font-medium">ขนส่งขากลับ</th>
              <th className="pb-2 font-medium">ครบกำหนดใกล้สุด</th>
              <th className="pb-2 font-medium">สถานะ (พนักงาน)</th>
              <th className="pb-2 font-medium">ปุ่มคืนเงิน</th>
              <th className="pb-2 text-right font-medium">ยอดคืนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => {
              const globalIdx = pageStart + i
              return (
                <ReturnRowItem
                  key={`${r.orderNo}-${r.sku}-${globalIdx}`}
                  row={r}
                  open={expanded.has(globalIdx)}
                  onToggle={() => toggleRow(globalIdx)}
                />
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="py-8 text-center text-muted-foreground">
                  {hasData ? "ไม่มีรายการตามเงื่อนไขที่เลือก" : "ยังไม่มีข้อมูลคืนสินค้าจากชีท"}
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
          ที่มาข้อมูล: ชีต "BIGSELLER_RAW" (รวมออเดอร์คืนสินค้าทุกแพลตฟอร์ม) · <b className="text-foreground">สถานะ (พนักงาน)</b> คืองานตรวจสอบของฝ่ายหลังการขาย ·{" "}
          <b className="text-foreground">ปุ่มคืนเงิน</b> บอกว่า Shopee ยังค้างปุ่มให้กดคืนเงินอยู่ไหม (คนละเรื่องกับสถานะตรวจสอบ ใช้ไม่ได้กับ TikTok/Lazada)
        </p>
      </div>
    </div>
  )
}

function ReturnRowItem({ row, open, onToggle }: { row: ReturnRow; open: boolean; onToggle: () => void }) {
  const diff = hasQtyDiscrepancy(row)
  const refundBtnKnown = row.refundButtonPending !== ""

  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/5">
        <td className="py-2.5">
          <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
        </td>
        <td className="py-2.5 font-medium text-foreground">{row.store}</td>
        <td className="py-2.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{platformLabel(row.platform)}</span>
        </td>
        <td className="py-2.5 text-muted-foreground">{row.sku || "-"}</td>
        <td className="py-2.5 text-right tabular-nums">{num(row.qtyToReturn)}</td>
        <td className={cn("py-2.5 text-right tabular-nums", diff && "font-semibold text-amber-500")}>
          {num(row.qtyStockedIn)}
          {diff && " ⚠"}
        </td>
        <td className="py-2.5 whitespace-nowrap text-xs">{row.flag || "-"}</td>
        <td className="py-2.5 whitespace-nowrap text-xs text-muted-foreground">{row.returnShipping || "-"}</td>
        <td className="py-2.5 whitespace-nowrap text-xs text-muted-foreground">{row.nearestDue || "-"}</td>
        <td className="py-2.5 whitespace-nowrap text-xs text-muted-foreground">{row.staffStatus || "-"}</td>
        <td className="py-2.5 whitespace-nowrap text-xs">
          {refundBtnKnown ? (
            <span className={row.refundButtonPending === "มี" ? "font-semibold text-amber-500" : "text-muted-foreground"}>
              {row.refundButtonPending === "มี" ? "ต้องกดคืนเงิน" : "เรียบร้อย"}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        <td className="py-2.5 text-right tabular-nums text-destructive">{money(row.refundAmount)}</td>
      </tr>
      {open && (
        <tr className="border-b border-white/5 bg-brand-500/5 last:border-0">
          <td colSpan={12} className="px-3 py-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
              <Detail label="เวลาสั่งซื้อ" value={row.orderTime} />
              <Detail label="เวลาขอคืน" value={row.requestTime} />
              <Detail label="เลขพัสดุ BigSeller" value={row.parcelNo} />
              <Detail label="ID คำสั่งซื้อหลังการขาย" value={row.afterSalesId} />
              <Detail label="ข้อเสนอ (Shopee)" value={row.shopeeOffer} />
              <Detail label="สาเหตุ" value={row.reason} />
              <Detail label="สถานะคำสั่งซื้อ" value={row.orderStatus} />
              <Detail label="สถานะ Stock-In" value={row.stockInStatus} />
              {row.shopeeReasonText && (
                <div className="col-span-2 border-t border-dashed border-border pt-2 sm:col-span-4">
                  <Detail label="เหตุผลที่ขอคืนสินค้า (ข้อความเต็ม)" value={row.shopeeReasonText} />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-foreground">{value || "-"}</p>
    </div>
  )
}
