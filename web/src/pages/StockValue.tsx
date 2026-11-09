import { useEffect, useMemo, useState } from "react"
import { Coins, Layers, Search } from "lucide-react"
import { useStockValueQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { ExportButton } from "@/components/common/ExportButton"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { ListToolbar, Pager, StatusTile, chipClass } from "@/components/returns/ReturnsUi"
import { stockValueReport } from "@/lib/reportExports"
import { ALL_WAREHOUSES, distinctWarehouses, filterStockValueRows, sortByValueDesc } from "@/lib/stock-value-selectors"

const PAGE_SIZE = 30
const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 })

/** มูลค่าสต็อกแต่ละคลัง — สต็อกคงเหลือ × ราคาต้นทุน (ไม่ใช่ราคาขาย) ต่อ SKU ต่อคลัง, รวม
 * เป็นยอดต่อคลังที่การ์ดด้านบน. อ่านข้อมูลจากสเปรดชีตของโปรเจกต์ BigSeller-Inventory
 * (คนละไฟล์จาก gv-returns-sync/คลัง+รับเข้า ที่หน้าอื่นในแอปนี้ใช้) ที่คำนวณจำนวน×ราคาไว้
 * เสร็จแล้วด้วยสูตรในชีต — หน้านี้แค่แสดงผล ไม่คำนวณซ้ำ. Read-only. */
export function StockValue() {
  const { data, isLoading, isError, error } = useStockValueQuery()
  const report = data?.stockValue ?? null
  const rows = useMemo(() => sortByValueDesc(report?.bySku ?? []), [report])
  const byWarehouse = report?.byWarehouse ?? []

  const [warehouse, setWarehouse] = useState(ALL_WAREHOUSES)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [warehouse, search])

  const warehouses = useMemo(() => distinctWarehouses(rows), [rows])
  const filtered = useMemo(() => filterStockValueRows(rows, warehouse, search), [rows, warehouse, search])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError) return <ErrorPanel message={error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"} />
  if (report?.error) return <ErrorPanel message={report.error} />

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-extrabold text-foreground">มูลค่าสต็อกแต่ละคลัง</h2>
        <p className="text-xs text-muted-foreground">
          จำนวนคงเหลือ × ราคาต้นทุนต่อ SKU (ไม่ใช่ราคาขาย) · กดการ์ดคลังเพื่อกรอง
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatusTile
          tone="neutral"
          icon={Layers}
          label="ทุกคลัง"
          count={rows.length}
          unit="SKU"
          sub={`รวม ${baht(byWarehouse.reduce((sum, w) => sum + w.totalValue, 0))} บาท`}
          active={warehouse === ALL_WAREHOUSES}
          onClick={() => setWarehouse(ALL_WAREHOUSES)}
        />
        {byWarehouse.map((w) => (
          <StatusTile
            key={w.warehouse}
            tone="info"
            icon={Coins}
            label={w.warehouse}
            count={rows.filter((r) => r.warehouse === w.warehouse).length}
            unit="SKU"
            sub={`${baht(w.totalValue)} บาท`}
            active={warehouse === w.warehouse}
            onClick={() => setWarehouse(warehouse === w.warehouse ? ALL_WAREHOUSES : w.warehouse)}
          />
        ))}
      </div>

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
                  <th className="pb-2.5 font-medium text-right">จำนวน</th>
                  <th className="pb-2.5 font-medium text-right">ราคาต้นทุน</th>
                  <th className="pb-2.5 font-medium text-right">มูลค่า (฿)</th>
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
    </div>
  )
}
