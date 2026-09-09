import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DailyComparisonRow } from "@/lib/workPerformanceRanking"

/**
 * Per-person "วันนี้ vs เมื่อวาน" table shared between the ผลงาน (BigSeller)
 * page and the ภาพรวม dashboard — every raw BigSeller column is shown for
 * every employee regardless of department: a ฝ่ายคลัง person can have a real
 * (non-zero) pick column on a day they helped ฝ่ายออนไลน์/ออฟไลน์, and a
 * ฝ่ายออนไลน์/ออฟไลน์ person's ใบย้ายสินค้า/ใบเติมสินค้า columns just stay 0.
 */
export function DailyComparisonTable({
  rows,
  todayLabel,
  yesterdayLabel,
}: {
  rows: DailyComparisonRow[]
  todayLabel: string | null | undefined
  yesterdayLabel: string | null | undefined
}) {
  return (
    <div className="glass-panel overflow-x-auto rounded-2xl p-4">
      <h3 className="mb-1 text-sm font-semibold text-foreground">เทียบผลงานวันนี้ vs เมื่อวาน</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        รายละเอียดของวันนี้ ({todayLabel ?? "-"}) ตามคอลัมน์จริงจากชีต + "พัสดุรวม" (หยิบ+แพ็ก+ตรวจสอบ+จัดส่งรวมกัน) เทียบกับ{" "}
        {yesterdayLabel ?? "ไม่มีข้อมูลวันก่อนหน้า"}
      </p>
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="pb-2 font-medium">ชื่อ</th>
            <th className="pb-2 font-medium">แผนก</th>
            <th className="pb-2 text-right font-medium">PDA หยิบของ</th>
            <th className="pb-2 text-right font-medium">พิมพ์ใบปะหน้า</th>
            <th className="pb-2 text-right font-medium">จำนวน Wave ที่หยิบ</th>
            <th className="pb-2 text-right font-medium">จำนวนรวม SKU ที่หยิบ</th>
            <th className="pb-2 text-right font-medium">ใบย้ายสินค้า</th>
            <th className="pb-2 text-right font-medium">ใบเติมสินค้า</th>
            <th className="pb-2 text-right font-medium">พัสดุรวม (เมื่อวาน)</th>
            <th className="pb-2 text-right font-medium">พัสดุรวม (วันนี้)</th>
            <th className="pb-2 text-right font-medium">% เปลี่ยนแปลง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.operator} className="border-b border-white/5 last:border-0">
              <td className="py-2 font-medium text-foreground">{r.name}</td>
              <td className="py-2 text-muted-foreground">{r.department}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayPdaPick.toLocaleString("th-TH")}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayPrintLabel.toLocaleString("th-TH")}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayPickWaveCount.toLocaleString("th-TH")}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayPickSku.toLocaleString("th-TH")}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayTransferDocs.toLocaleString("th-TH")}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.todayReplenishDocs.toLocaleString("th-TH")}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.yesterday.toLocaleString("th-TH")}</td>
              <td className="py-2 text-right tabular-nums text-foreground">{r.today.toLocaleString("th-TH")}</td>
              <td className="py-2 text-right">
                {r.pctChange === null ? (
                  <span className="text-xs text-muted-foreground">ไม่มีข้อมูลเมื่อวาน</span>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-sm font-semibold tabular-nums",
                      r.pctChange > 0 ? "text-emerald-glow" : r.pctChange < 0 ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {r.pctChange > 0 ? <ArrowUp className="size-3.5" /> : r.pctChange < 0 ? <ArrowDown className="size-3.5" /> : <Minus className="size-3.5" />}
                    {Math.abs(r.pctChange).toFixed(0)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="py-6 text-center text-muted-foreground">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
