import { ClampText } from "@/components/common/ClampText"
import { LIST_PAGE_SIZE } from "@/lib/page-size"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Coins, Info, MinusCircle, Search, Truck, Warehouse } from "lucide-react"
import { useAnimatedNumber } from "@/lib/useAnimatedNumber"
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

const PAGE_SIZE = LIST_PAGE_SIZE
const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 })

/** One colour per warehouse (by its rank), used by the share bar, the cards and the rings so a warehouse
 * keeps the same colour everywhere. Brand palette; deliberately not the status colours. */
const WAREHOUSE_COLOURS = ["#2ba8a2", "#5dade2", "#ffd23f", "#ef6c4a", "#8b7be0", "#ec6a98", "#27ae60", "#f59e0b"]
const colourOf = (all: { warehouse: string }[], name: string): string =>
  WAREHOUSE_COLOURS[Math.max(0, all.findIndex((w) => w.warehouse === name)) % WAREHOUSE_COLOURS.length] ?? "#2ba8a2"

/** A number that counts up when it first appears. */
function Count({ value }: { value: number }) {
  const animated = useAnimatedNumber(value)
  return <>{baht(Math.round(animated))}</>
}

/** Share of the total as a ring with the percentage in the middle. */
function ShareRing({ percent, colour }: { percent: number; colour: string }) {
  const radius = 21
  const circumference = 2 * Math.PI * radius
  const shown = percent > 0 ? Math.max(3, Math.min(100, percent)) : 0
  const dash = (shown / 100) * circumference
  const label = `${percent > 0 && percent < 10 ? percent.toFixed(1) : percent.toFixed(0)}%`
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${label} ของทั้งหมด`} className="shrink-0">
      <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="7" className="stroke-muted" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform="rotate(-90 32 32)"
        style={{ filter: `drop-shadow(0 0 4px ${colour}99)` }}
      />
      <text x="32" y="36" textAnchor="middle" className="fill-foreground text-[12px] font-extrabold">
        {label}
      </text>
    </svg>
  )
}

/** A page block: heading, one line saying what it shows, then the content. */
function Block({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h3 className="page-heading text-xl font-extrabold text-foreground">{title}</h3>
        {caption && <ClampText className="mt-0.5 text-sm text-muted-foreground">{caption}</ClampText>}
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
      {/* 1. The dominant block: the total, the goods on the road, and how the total splits across warehouses. */}
      <section
        aria-label="มูลค่าสต็อกรวม"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3a37] via-[#125e59] to-[#17706b] p-5 text-white shadow-[0_30px_70px_-30px_rgba(11,58,55,0.95)] ring-1 ring-white/10 sm:p-8"
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="absolute -right-16 -top-20 size-72 rounded-full bg-brand-400/30 blur-3xl" />
          <span className="absolute -bottom-24 left-1/4 size-64 rounded-full bg-gold/15 blur-3xl" />
        </div>

        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/30">
                <Coins className="size-6" />
              </span>
              {snapshot.asOf && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-extrabold shadow-[0_6px_16px_rgba(0,0,0,0.25)]",
                    stale ? "text-amber-800" : "text-emerald-700"
                  )}
                >
                  {stale ? <Clock className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                  {stale
                    ? `ข้อมูล BigSeller เก่า ${num(snapshot.ageDays ?? 0)} วัน`
                    : `ข้อมูล BigSeller ${snapshot.ageDays === 0 ? "วันนี้" : `${num(snapshot.ageDays ?? 0)} วันก่อน`}`}
                </span>
              )}
            </div>
            <h2 className="mt-4 text-2xl font-extrabold tracking-wide drop-shadow-md sm:text-3xl">มูลค่าสต็อกแต่ละคลัง</h2>
            <p className="mt-1 text-sm text-white/85">จำนวนคงเหลือ × ราคาต้นทุนต่อ SKU (ไม่ใช่ราคาขาย) · กดการ์ดคลังเพื่อกรองตารางด้านล่าง</p>
            <p className="mt-5 text-xs font-bold text-white/85">มูลค่าสต็อกรวม {num(snapshot.warehouses.length)} คลัง</p>
            <p className="text-[26px] font-extrabold leading-tight tabular-nums tracking-tight drop-shadow-md sm:text-6xl">
              ฿<Count value={snapshot.total} />
            </p>
            <p className="mt-1 text-sm text-white/85">{num(rows.length)} รายการ SKU × คลัง</p>
          </div>

          <div className="rounded-2xl bg-[#082a27]/40 p-4 shadow-[0_14px_28px_-16px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-white/20 backdrop-blur-md sm:p-5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-white/90">
              <span className="flex size-6 items-center justify-center rounded-lg bg-white/20">
                <Truck className="size-3.5" />
              </span>
              สินค้าระหว่างทาง
            </p>
            <p className="mt-2 text-[22px] font-extrabold tabular-nums drop-shadow-sm sm:text-4xl">฿{baht(snapshot.inTransitCost)}</p>
            <p className="mt-2 text-xs text-white/85">
              {num(snapshot.inTransitUnits)} ชิ้น · ไป {num(snapshot.inTransitWarehouses)} คลัง · ไม่รวมในยอดรวมด้านซ้าย
            </p>
          </div>
        </div>

        <div className="relative mt-6">
          <p className="mb-2 text-xs font-bold text-white/85">สัดส่วนมูลค่าแต่ละคลัง</p>
          <div className="flex h-4 overflow-hidden rounded-full bg-black/25 shadow-inner" role="img" aria-label="สัดส่วนมูลค่าสต็อกแต่ละคลัง">
            {snapshot.warehouses
              .filter((w) => w.value > 0)
              .map((w) => (
                <div
                  key={w.warehouse}
                  className="h-full min-w-[3px] transition-[width] duration-500 first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${w.share}%`, background: colourOf(snapshot.warehouses, w.warehouse) }}
                  title={`${w.warehouse} ${w.share.toFixed(1)}%`}
                />
              ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-white/90">
            {snapshot.warehouses
              .filter((w) => w.value > 0)
              .map((w) => (
                <li key={w.warehouse} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full shadow-sm ring-1 ring-white/40" style={{ background: colourOf(snapshot.warehouses, w.warehouse) }} aria-hidden />
                  {w.warehouse} <b className="tabular-nums">{w.share.toFixed(w.share < 1 ? 1 : 0)}%</b>
                </li>
              ))}
          </ul>
        </div>
      </section>

      {/* 2. One card per warehouse: value, share of the total, and a flag when it disagrees with BigSeller. */}
      <Block title="แยกตามคลัง" caption="เรียงจากมูลค่ามากไปน้อย · ป้ายสีเหลือง = มูลค่าในเว็บต่างจากที่ BigSeller คำนวณมาก">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.warehouses.map((w, index) => {
            const active = warehouse === w.warehouse
            const colour = colourOf(snapshot.warehouses, w.warehouse)
            return (
              <button
                key={w.warehouse}
                type="button"
                aria-pressed={active}
                onClick={() => setWarehouse(active ? ALL_WAREHOUSES : w.warehouse)}
                className={cn(
                  "glass-panel group relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4 pt-5 text-left shadow-[0_16px_34px_-22px_rgba(43,168,162,0.7)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_40px_-20px_rgba(43,168,162,0.85)]",
                  active && "ring-2 ring-primary"
                )}
              >
                <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${colour}, ${colour}55)` }} aria-hidden />
                <span className="flex items-start gap-3">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_6px_14px_-6px_rgba(0,0,0,0.35)]"
                    style={{ background: `linear-gradient(145deg, ${colour}33, ${colour}1a)`, color: colour }}
                  >
                    <Warehouse className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-base font-extrabold leading-snug text-foreground">{w.warehouse}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">อันดับ {num(index + 1)}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
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
                  </span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[22px] font-extrabold tabular-nums text-foreground sm:text-3xl">฿{baht(w.value)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{num(skuCount(w.warehouse))} SKU</span>
                  </span>
                  <ShareRing percent={w.share} colour={colour} />
                </span>
              </button>
            )
          })}
        </div>
      </Block>

      {/* 3. Goods in transit, by destination warehouse. */}
      {inTransit.length > 0 && (
        <Block title="สินค้าระหว่างทาง" caption="โอนระหว่างคลังและยังไม่รับเข้า · แยกตามคลังปลายทาง · มูลค่าเป็นต้นทุนของ BigSeller โดยตรง">
          <ul className="glass-panel divide-y divide-border/60 overflow-hidden rounded-2xl shadow-[0_18px_40px_-26px_rgba(43,168,162,0.45)]">
            {inTransit.map((r) => (
              <li key={r.warehouse} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/60">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/30 to-amber-500/10 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_10px_-4px_rgba(245,158,11,0.5)] dark:text-amber-300">
                  <Truck className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">→ {r.warehouse}</span>
                  <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-muted shadow-inner">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.55)]"
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
              <table className="stack-table w-full min-w-[560px] text-left text-sm">
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
                        <td className="stack-title py-2 font-medium text-foreground">{w.warehouse}</td>
                        <td data-label="มูลค่าในเว็บ (฿)" className="py-2 text-right tabular-nums">{baht(w.value)}</td>
                        <td data-label="BigSeller คำนวณ (฿)" className="py-2 text-right tabular-nums">{baht(ref.bigsellerOnHandCost)}</td>
                        <td data-label="ส่วนต่าง (฿)" className="py-2 text-right font-semibold tabular-nums">
                          {diff > 0 ? "+" : ""}
                          {baht(diff)}
                        </td>
                        <td data-label="ต่าง (%)" className="py-2 text-right tabular-nums">
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
              <table className="stack-table w-full min-w-[560px] text-left text-base">
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
                      <td className="stack-title py-2.5 font-medium text-foreground">{r.sku}</td>
                      <td data-label="คลัง" className="py-2.5 text-muted-foreground">{r.warehouse}</td>
                      <td data-label="จำนวน" className="py-2.5 text-right tabular-nums">{num(r.qty)}</td>
                      <td data-label="ราคาต้นทุน" className="py-2.5 text-right tabular-nums">{baht(r.costPrice)}</td>
                      <td data-label="มูลค่า (฿)" className="py-2.5 text-right font-semibold tabular-nums text-foreground">{baht(r.stockValue)}</td>
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
