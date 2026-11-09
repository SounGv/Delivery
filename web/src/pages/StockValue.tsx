import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Coins, Info, MinusCircle, Search, Truck } from "lucide-react"
import { useStockValueQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { ExportButton } from "@/components/common/ExportButton"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { ListToolbar, Pager, StatusPill, chipClass } from "@/components/returns/ReturnsUi"
import { stockValueReport } from "@/lib/reportExports"
import {
  ALL_WAREHOUSES,
  STOCK_DIFF_WARN_PERCENT,
  STOCK_REFERENCE_STALE_DAYS,
  distinctWarehouses,
  filterStockValueRows,
  sortByValueDesc,
  summarizeStockValue,
} from "@/lib/stock-value-selectors"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 30
const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 })

/** A page block: heading, one line saying what it shows, then the content. */
function Block({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h3 className="text-xl font-extrabold text-foreground">{title}</h3>
        {caption && <p className="mt-0.5 text-sm text-muted-foreground">{caption}</p>}
      </div>
      {children}
    </section>
  )
}

/** มูลค่าสต็อกแต่ละคลัง — สต็อกคงเหลือ × ราคาต้นทุน (ไม่ใช่ราคาขาย) ต่อ SKU ต่อคลัง, รวม
 * เป็นยอดต่อคลังที่การ์ดด้านบน. อ่านข้อมูลจากสเปรดชีตของโปรเจกต์ BigSeller-Inventory
 * (คนละไฟล์จาก gv-returns-sync/คลัง+รับเข้า ที่หน้าอื่นในแอปนี้ใช้) ที่คำนวณจำนวน×ราคาไว้
 * เสร็จแล้วด้วยสูตรในชีต — หน้านี้แค่แสดงผล ไม่คำนวณซ้ำ. Read-only.
 *
 * Layout, top to bottom: total + goods in transit, one card per warehouse (click to filter the table),
 * the BigSeller-difference note folded away, in-transit by destination, then the SKU table.
 *
 * Needs VITE_APPS_SCRIPT_URL to point at the deployment carrying
 * STOCK_VALUE_SOURCE_ID_/loadStockValueByWarehouse_ (apps-script/SheetParser.js)
 * — confirmed 2026-11-09 that the GitHub Actions secret had drifted to an
 * older, separate deployment the local clasp project couldn't even see. */
export function StockValue() {
  const { data, isLoading, isError, error } = useStockValueQuery()
  const report = data?.stockValue ?? null
  const rows = useMemo(() => sortByValueDesc(report?.bySku ?? []), [report])
  const snapshot = useMemo(() => (report && !report.error ? summarizeStockValue(report, Date.now()) : null), [report])
  const reference = useMemo(() => report?.reference ?? [], [report])
  const referenceOf = (name: string) => reference.find((r) => r.warehouse === name)
  const inTransit = useMemo(
    () => [...reference].filter((r) => r.inTransitUnits > 0).sort((a, b) => b.bigsellerInTransitCost - a.bigsellerInTransitCost),
    [reference]
  )
  const maxInTransit = inTransit[0]?.bigsellerInTransitCost ?? 0

  const [warehouse, setWarehouse] = useState(ALL_WAREHOUSES)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [warehouse, search])

  const warehouses = useMemo(() => distinctWarehouses(rows), [rows])
  const skuCount = (name: string) => rows.filter((r) => r.warehouse === name).length
  const filtered = useMemo(() => filterStockValueRows(rows, warehouse, search), [rows, warehouse, search])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError) return <ErrorPanel message={error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"} />
  if (report?.error) return <ErrorPanel message={report.error} />
  if (!snapshot) return <ErrorPanel message="ไม่พบข้อมูลมูลค่าสต็อก" />

  const stale = snapshot.ageDays !== null && snapshot.ageDays > STOCK_REFERENCE_STALE_DAYS
  const selected = warehouse === ALL_WAREHOUSES ? null : snapshot.warehouses.find((w) => w.warehouse === warehouse) ?? null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">มูลค่าสต็อกแต่ละคลัง</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">จำนวนคงเหลือ × ราคาต้นทุนต่อ SKU (ไม่ใช่ราคาขาย) · กดการ์ดคลังเพื่อกรองตารางด้านล่าง</p>
        </div>
        {snapshot.asOf &&
          (stale ? (
            <StatusPill tone="warn" icon={Clock}>
              ข้อมูล BigSeller เก่า {num(snapshot.ageDays ?? 0)} วัน
            </StatusPill>
          ) : (
            <StatusPill tone="ok" icon={CheckCircle2}>
              ข้อมูล BigSeller {snapshot.ageDays === 0 ? "วันนี้" : `${num(snapshot.ageDays ?? 0)} วันก่อน`}
            </StatusPill>
          ))}
      </header>

      {/* 1. The two numbers everyone asks for first. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="glass-panel relative overflow-hidden rounded-2xl p-5 md:col-span-3">
          <span className="absolute inset-y-0 left-0 w-1.5 bg-primary" aria-hidden />
          <p className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <Coins className="size-4" /> มูลค่าสต็อกรวม {num(snapshot.warehouses.length)} คลัง
          </p>
          <p className="mt-1 text-5xl font-extrabold tabular-nums text-foreground">
            ฿{baht(snapshot.total)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{num(rows.length)} รายการ SKU × คลัง</p>
        </div>
        <div className="glass-panel relative overflow-hidden rounded-2xl p-5 md:col-span-2">
          <span className="absolute inset-y-0 left-0 w-1.5 bg-amber-500" aria-hidden />
          <p className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <Truck className="size-4" /> สินค้าระหว่างทาง
          </p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums text-foreground">฿{baht(snapshot.inTransitCost)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {num(snapshot.inTransitUnits)} ชิ้น · ไป {num(snapshot.inTransitWarehouses)} คลัง · ไม่รวมในยอดรวมด้านซ้าย
          </p>
        </div>
      </div>

      {/* 2. One card per warehouse: value, share of the total, and a flag when it disagrees with BigSeller. */}
      <Block title="แยกตามคลัง" caption="เรียงจากมูลค่ามากไปน้อย · ป้ายสีเหลือง = มูลค่าในเว็บต่างจากที่ BigSeller คำนวณมาก">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.warehouses.map((w) => {
            const active = warehouse === w.warehouse
            return (
              <button
                key={w.warehouse}
                type="button"
                aria-pressed={active}
                onClick={() => setWarehouse(active ? ALL_WAREHOUSES : w.warehouse)}
                className={cn(
                  "glass-panel flex flex-col gap-2 rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5",
                  active && "ring-2 ring-primary"
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-base font-extrabold leading-snug text-foreground">{w.warehouse}</span>
                  {w.value === 0 ? (
                    <StatusPill tone="neutral" icon={MinusCircle} small>
                      ไม่มีสต็อก
                    </StatusPill>
                  ) : w.highDiff && w.diffPercent !== null ? (
                    <StatusPill tone="warn" icon={AlertTriangle} small>
                      ต่างจาก BigSeller {w.diffPercent > 0 ? "+" : ""}
                      {w.diffPercent.toFixed(0)}%
                    </StatusPill>
                  ) : null}
                </span>
                <span className="text-3xl font-extrabold tabular-nums text-foreground">฿{baht(w.value)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(w.value > 0 ? 2 : 0, w.share)}%` }} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {w.share.toFixed(w.share < 1 && w.share > 0 ? 1 : 0)}% ของทั้งหมด · {num(skuCount(w.warehouse))} SKU
                </span>
              </button>
            )
          })}
        </div>
      </Block>

      {/* 3. Goods in transit, by destination warehouse. */}
      {inTransit.length > 0 && (
        <Block title="สินค้าระหว่างทาง" caption="โอนระหว่างคลังและยังไม่รับเข้า · แยกตามคลังปลายทาง · มูลค่าเป็นต้นทุนของ BigSeller โดยตรง">
          <ul className="glass-panel divide-y divide-border/60 overflow-hidden rounded-2xl">
            {inTransit.map((r) => (
              <li key={r.warehouse} className="flex items-center gap-3 px-4 py-3">
                <Truck className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">→ {r.warehouse}</span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-amber-500"
                      style={{ width: `${maxInTransit > 0 ? Math.max(2, (r.bigsellerInTransitCost / maxInTransit) * 100) : 0}%` }}
                    />
                  </span>
                </span>
                <span className="w-28 shrink-0 text-right">
                  <span className="block text-base font-extrabold tabular-nums text-foreground">฿{baht(r.bigsellerInTransitCost)}</span>
                  <span className="block text-xs text-muted-foreground">{num(r.inTransitUnits)} ชิ้น</span>
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* 4. The reconciliation note, folded away: it matters to whoever checks the numbers, not to everyone. */}
      {snapshot.warehouses.some((w) => referenceOf(w.warehouse)) && (
        <details className="glass-panel group rounded-2xl">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-2 text-base font-extrabold text-foreground">
                <Info className="size-5 text-primary" /> หมายเหตุ: ส่วนต่างจากมูลค่าที่ BigSeller คำนวณ
              </span>
              {snapshot.highDiffCount > 0 ? (
                <StatusPill tone="warn" icon={AlertTriangle} small>
                  {num(snapshot.highDiffCount)} คลังต่างตั้งแต่ {STOCK_DIFF_WARN_PERCENT}%
                </StatusPill>
              ) : (
                <StatusPill tone="ok" icon={CheckCircle2} small>
                  ทุกคลังต่างไม่ถึง {STOCK_DIFF_WARN_PERCENT}%
                </StatusPill>
              )}
            </span>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 px-5 pb-5">
            <p className="text-xs text-muted-foreground">
              เว็บคิด จำนวน × ราคาต้นทุนจากไฟล์ SKU Merchant · BigSeller คิด จำนวน × ต้นทุนเฉลี่ยถ่วงน้ำหนักของมันเอง (SKU ที่ BigSeller ไม่มีต้นทุนนับเป็น 0)
              ตัวเลขสองฝั่งจึงไม่เท่ากัน ยังไม่ได้ตัดสินว่าฝั่งไหนตรงกับบัญชี
              {snapshot.asOf ? ` · ข้อมูล BigSeller ณ ${new Date(snapshot.asOf).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">คลัง</th>
                    <th className="pb-2 text-right font-medium">มูลค่าในเว็บ (฿)</th>
                    <th className="pb-2 text-right font-medium">BigSeller คำนวณ (฿)</th>
                    <th className="pb-2 text-right font-medium">ส่วนต่าง (฿)</th>
                    <th className="pb-2 text-right font-medium">ต่าง (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.warehouses.map((w) => {
                    const ref = referenceOf(w.warehouse)
                    if (!ref) return null
                    const diff = w.value - ref.bigsellerOnHandCost
                    return (
                      <tr key={w.warehouse} className="border-b border-white/5 last:border-0">
                        <td className="py-2 font-medium text-foreground">{w.warehouse}</td>
                        <td className="py-2 text-right tabular-nums">{baht(w.value)}</td>
                        <td className="py-2 text-right tabular-nums">{baht(ref.bigsellerOnHandCost)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          {diff > 0 ? "+" : ""}
                          {baht(diff)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {w.diffPercent === null ? (
                            "—"
                          ) : w.highDiff ? (
                            <StatusPill tone="warn" small>
                              {w.diffPercent > 0 ? "+" : ""}
                              {w.diffPercent.toFixed(0)}%
                            </StatusPill>
                          ) : (
                            <StatusPill tone="ok" small>
                              {w.diffPercent.toFixed(1)}%
                            </StatusPill>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {/* 5. The SKU list, last: the detail behind the cards above. */}
      <Block
        title="รายการ SKU"
        caption={selected ? `กรองเฉพาะ ${selected.warehouse} · ${num(filtered.length)} รายการ · เรียงจากมูลค่าสูงสุด` : `ทุกคลัง · ${num(filtered.length)} รายการ · เรียงจากมูลค่าสูงสุด`}
      >
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="ค้นหา SKU"
          chips={
            <>
              <button type="button" onClick={() => setWarehouse(ALL_WAREHOUSES)} className={chipClass(warehouse === ALL_WAREHOUSES)}>
                ทุกคลัง
              </button>
              {warehouses.map((w) => (
                <button key={w} type="button" onClick={() => setWarehouse(w)} className={chipClass(warehouse === w)}>
                  {w}
                </button>
              ))}
            </>
          }
          moreFilters={null}
          activeCount={warehouse === ALL_WAREHOUSES ? 0 : 1}
          onClear={() => setWarehouse(ALL_WAREHOUSES)}
          actions={<ExportButton build={() => stockValueReport(filtered)} disabled={filtered.length === 0} />}
        />

        <div className="glass-panel rounded-2xl p-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Search className="size-6" />
              <p>ไม่พบ SKU ที่ตรงกับเงื่อนไข</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-base">
                <thead>
                  <tr className="border-b border-border text-sm text-muted-foreground">
                    <th className="pb-2.5 font-medium">SKU</th>
                    <th className="pb-2.5 font-medium">คลัง</th>
                    <th className="pb-2.5 text-right font-medium">จำนวน</th>
                    <th className="pb-2.5 text-right font-medium">ราคาต้นทุน</th>
                    <th className="pb-2.5 text-right font-medium">มูลค่า (฿)</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr key={`${r.sku}::${r.warehouse}`} className="border-b border-white/5 last:border-0">
                      <td className="py-2.5 font-medium text-foreground">{r.sku}</td>
                      <td className="py-2.5 text-muted-foreground">{r.warehouse}</td>
                      <td className="py-2.5 text-right tabular-nums">{num(r.qty)}</td>
                      <td className="py-2.5 text-right tabular-nums">{baht(r.costPrice)}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">{baht(r.stockValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pager page={page} totalPages={totalPages} onChange={setPage} />
      </Block>
    </div>
  )
}
