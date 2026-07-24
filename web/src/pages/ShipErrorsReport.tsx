import { useMemo, useState } from "react"
import { AlertTriangle, Download, Percent, ShieldCheck, Users } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { downloadCsv } from "@/lib/csv"
import { formatMonthLabel } from "@/lib/format"

/** Post-shipment error report ("ข้อผิดพลาดหลังส่ง") from the standalone error
 * sheet. Quality (error rate) is shown SEPARATELY from productivity and is never
 * auto-deducted from output, per requirement. Reads real data only — shows a
 * redeploy hint until the parser that reads that sheet is live. */
export function ShipErrorsReport() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const [month, setMonth] = useState("all")
  const [employee, setEmployee] = useState("all")
  const [poQuery, setPoQuery] = useState("")
  const [skuQuery, setSkuQuery] = useState("")

  const shipErrors = useMemo(() => data?.shipErrors ?? [], [data])

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const availableMonths = [...new Set(shipErrors.map((e) => e.date.slice(0, 7)).filter(Boolean))].sort()
  const employeeNames = [...new Set(shipErrors.map((e) => e.name).filter(Boolean))].sort()

  const filtered = shipErrors.filter(
    (e) =>
      (month === "all" || e.date.startsWith(month)) &&
      (employee === "all" || e.name === employee) &&
      (!poQuery.trim() || e.po.toLowerCase().includes(poQuery.trim().toLowerCase())) &&
      (!skuQuery.trim() ||
        e.wrongSku.toLowerCase().includes(skuQuery.trim().toLowerCase()) ||
        e.rightSku.toLowerCase().includes(skuQuery.trim().toLowerCase()))
  )

  // Parcels in the same scope (for a real error rate). Month filter → that month's parcels; else all.
  let parcelsInScope = 0
  for (const emp of data.employees) {
    for (const [d, entry] of Object.entries(emp.byDate)) {
      if (month !== "all" && !d.startsWith(month)) continue
      parcelsInScope += entry.parcels ?? 0
    }
  }
  const errorRate = parcelsInScope > 0 ? (filtered.length / parcelsInScope) * 100 : 0
  const involvedEmployees = new Set(filtered.map((e) => e.name)).size
  const distinctPOs = new Set(filtered.map((e) => e.po).filter(Boolean)).size

  const hasErrorData = shipErrors.length > 0

  const handleExport = () => {
    downloadCsv(
      `ship-errors_${month}.csv`,
      ["วันที่", "พนักงาน", "เลขที่ PO", "SKU ที่ผิด", "จำนวนผิด", "SKU ที่ถูก", "จำนวนถูก", "หมายเหตุ"],
      filtered.map((e) => [e.date, e.name, e.po, e.wrongSku, e.wrongQty ?? "", e.rightSku, e.rightQty ?? "", e.note])
    )
  }

  const selectCls = "rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
  const inputCls = "w-32 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"

  return (
    <div className="space-y-4">
      {!hasErrorData && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">ยังไม่พบข้อมูลจากชีท "ข้อผิดพลาด / ออเดอร์ส่งผิด"</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ระบบอ่านชีทข้อผิดพลาดแบบ read-only (คอลัมน์ วันที่ / ชื่อ / เลขที่ PO / SKU ที่ผิด / จำนวนผิด / SKU ที่ถูก / จำนวนถูก / หมายเหตุ)
              แต่ API ยังไม่ส่งข้อมูลนี้มา — ต้องอัปเดต Apps Script (SheetParser.js เวอร์ชันใหม่ที่อ่านชีทข้อผิดพลาดแล้ว) แล้ว Deploy → New version
            </p>
          </div>
        </div>
      )}

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground">เดือน</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทุกเดือน</option>
            {availableMonths.map((m) => (
              <option key={m} value={m} className="bg-popover text-popover-foreground">{formatMonthLabel(m)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground">พนักงาน</label>
          <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {employeeNames.map((n) => (
              <option key={n} value={n} className="bg-popover text-popover-foreground">{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground">เลขที่ PO</label>
          <input value={poQuery} onChange={(e) => setPoQuery(e.target.value)} placeholder="ค้นหา PO..." className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground">SKU</label>
          <input value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} placeholder="ค้นหา SKU..." className={inputCls} />
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Download className="size-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="ข้อผิดพลาดหลังส่ง" value={filtered.length} icon={AlertTriangle} gradient="bg-gradient-to-br from-rose-500 to-destructive" suffix="รายการ" />
        <KpiCard title="Error Rate (คุณภาพ)" value={errorRate} icon={Percent} gradient="bg-gradient-to-br from-amber-500 to-rose-500" formatValue={(n) => n.toFixed(2)} suffix="%" />
        <KpiCard title="พนักงานที่เกี่ยวข้อง" value={involvedEmployees} icon={Users} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="คน" />
        <KpiCard title="PO ที่ผิด" value={distinctPOs} icon={ShieldCheck} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="PO" />
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">รายการข้อผิดพลาดหลังส่ง</h3>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Error Rate = จำนวนข้อผิดพลาด ÷ จำนวนพัสดุทั้งหมด × 100 — เป็นคะแนน "คุณภาพ" แยกจากคะแนน "ผลงาน" (ไม่หักผลงานอัตโนมัติ)
        </p>
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">วันที่</th>
              <th className="pb-2 font-medium">พนักงาน</th>
              <th className="pb-2 font-medium">เลขที่ PO</th>
              <th className="pb-2 font-medium">SKU ที่ผิด</th>
              <th className="pb-2 font-medium">จำนวนผิด</th>
              <th className="pb-2 font-medium">SKU ที่ถูก</th>
              <th className="pb-2 font-medium">จำนวนถูก</th>
              <th className="pb-2 font-medium">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={`${e.date}-${e.po}-${i}`} className="border-b border-white/5 last:border-0">
                <td className="py-2 text-foreground">{e.date}</td>
                <td className="py-2 text-foreground">{e.name}</td>
                <td className="py-2 text-muted-foreground">{e.po || "-"}</td>
                <td className="py-2 text-destructive">{e.wrongSku || "-"}</td>
                <td className="py-2 text-muted-foreground">{e.wrongQty ?? "-"}</td>
                <td className="py-2 text-emerald-glow">{e.rightSku || "-"}</td>
                <td className="py-2 text-muted-foreground">{e.rightQty ?? "-"}</td>
                <td className="py-2 text-muted-foreground">{e.note || "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  {hasErrorData ? "ไม่มีข้อผิดพลาดตามเงื่อนไขที่เลือก" : "ยังไม่มีข้อมูลข้อผิดพลาดจากชีท"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
