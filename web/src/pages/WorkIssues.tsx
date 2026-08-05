import { useMemo, useState } from "react"
import { AlertTriangle, CircleAlert, Clock, Download, ListChecks } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { Badge } from "@/components/ui/badge"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { downloadCsv } from "@/lib/csv"
import { cn } from "@/lib/utils"
import type { WorkIssue } from "@/api/types"

const RESOLVED_STATUS = new Set(["เสร็จสิ้น", "แก้ไขแล้ว", "ปิดงาน"])

function isResolved(status: string): boolean {
  return RESOLVED_STATUS.has(status.trim())
}

function isUrgent(urgency: string): boolean {
  return urgency.indexOf("ด่วน") !== -1
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (!urgency) return <span className="text-muted-foreground">-</span>
  const urgent = isUrgent(urgency)
  return (
    <Badge variant="outline" className={cn(urgent ? "border-destructive/40 text-destructive" : "border-amber-500/40 text-amber-500")}>
      {urgency}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  const resolved = isResolved(status)
  return (
    <Badge variant="outline" className={cn(resolved ? "border-emerald-glow/40 text-emerald-glow" : "border-brand-500/40 text-brand-400")}>
      {status}
    </Badge>
  )
}

/** "ปัญหาหน้างาน" — workplace obstacles/issues staff run into while working
 * (unstable internet, printer/ink problems, PC crashes, etc.), from the
 * standalone "ปัญหารอแก้" sheet. Read-only; shows a redeploy hint until the
 * parser that reads that tab is live. */
export function WorkIssues() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const [status, setStatus] = useState("all")
  const [urgency, setUrgency] = useState("all")
  const [category, setCategory] = useState("all")

  const issues = useMemo(() => data?.workIssues ?? [], [data])

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const statuses = [...new Set(issues.map((i) => i.status).filter(Boolean))].sort()
  const urgencies = [...new Set(issues.map((i) => i.urgency).filter(Boolean))].sort()
  const categories = [...new Set(issues.map((i) => i.category).filter(Boolean))].sort()

  const filtered = issues.filter(
    (i) =>
      (status === "all" || i.status === status) &&
      (urgency === "all" || i.urgency === urgency) &&
      (category === "all" || i.category === category)
  )
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date))

  const openCount = issues.filter((i) => !isResolved(i.status)).length
  const urgentOpenCount = issues.filter((i) => !isResolved(i.status) && isUrgent(i.urgency)).length
  const resolvedCount = issues.filter((i) => isResolved(i.status)).length

  const hasData = issues.length > 0

  const handleExport = () => {
    downloadCsv(
      `work-issues_${status}.csv`,
      ["วันที่", "ผู้แจ้ง", "หมวดหมู่", "รายละเอียดปัญหา", "ความเร่งด่วน", "ผู้รับผิดชอบ", "วันที่เริ่มแก้ไข", "กำหนดเสร็จ", "วิธีแก้ไข", "สถานะ", "ผลตรวจสอบ", "หมายเหตุ"],
      sorted.map((i: WorkIssue) => [
        i.date, i.reporter, i.category, i.detail, i.urgency, i.assignee, i.startDate, i.dueDate, i.resolution, i.status, i.verifyResult, i.note,
      ])
    )
  }

  const selectCls = "rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"

  return (
    <div className="space-y-4">
      {!hasData && (
        <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">ยังไม่พบข้อมูลจากชีท "ปัญหารอแก้"</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ระบบอ่านชีทนี้แบบ read-only แต่ API ยังไม่ส่งข้อมูลนี้มา — ต้องอัปเดต Apps Script (SheetParser.js เวอร์ชันใหม่ที่อ่านชีท "ปัญหารอแก้" แล้ว) แล้ว Deploy → New version
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="ปัญหาทั้งหมด" value={issues.length} icon={ListChecks} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="รายการ" />
        <KpiCard title="ยังไม่ปิดงาน" value={openCount} icon={Clock} gradient="bg-gradient-to-br from-amber-500 to-amber-600" suffix="รายการ" />
        <KpiCard title="ด่วน & ยังไม่ปิดงาน" value={urgentOpenCount} icon={CircleAlert} gradient="bg-gradient-to-br from-rose-500 to-destructive" suffix="รายการ" />
        <KpiCard title="ปิดงานแล้ว" value={resolvedCount} icon={ListChecks} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="รายการ" />
      </div>

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] text-muted-foreground">สถานะ</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {statuses.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground">ความเร่งด่วน</label>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {urgencies.map((u) => (
              <option key={u} value={u} className="bg-popover text-popover-foreground">{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground">หมวดหมู่</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
            <option value="all" className="bg-popover text-popover-foreground">ทั้งหมด</option>
            {categories.map((c) => (
              <option key={c} value={c} className="bg-popover text-popover-foreground">{c}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={handleExport}
            disabled={sorted.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Download className="size-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">รายการปัญหาหน้างาน</h3>
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium">วันที่แจ้ง</th>
              <th className="pb-2 font-medium">ผู้แจ้ง</th>
              <th className="pb-2 font-medium">หมวดหมู่</th>
              <th className="pb-2 font-medium">รายละเอียดปัญหา</th>
              <th className="pb-2 font-medium">ความเร่งด่วน</th>
              <th className="pb-2 font-medium">ผู้รับผิดชอบ</th>
              <th className="pb-2 font-medium">กำหนดเสร็จ</th>
              <th className="pb-2 font-medium">วิธีแก้ไข</th>
              <th className="pb-2 font-medium">สถานะ</th>
              <th className="pb-2 font-medium">ผลตรวจสอบ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((i, idx) => (
              <tr key={`${i.date}-${i.reporter}-${idx}`} className="border-b border-white/5 last:border-0 align-top">
                <td className="py-2 text-foreground">{i.date || "-"}</td>
                <td className="py-2 text-foreground">{i.reporter || "-"}</td>
                <td className="py-2 text-muted-foreground">{i.category || "-"}</td>
                <td className="py-2 text-foreground">{i.detail || "-"}</td>
                <td className="py-2"><UrgencyBadge urgency={i.urgency} /></td>
                <td className="py-2 text-muted-foreground">{i.assignee || "-"}</td>
                <td className="py-2 text-muted-foreground">{i.dueDate || "-"}</td>
                <td className="py-2 text-muted-foreground">{i.resolution || "-"}</td>
                <td className="py-2"><StatusBadge status={i.status} /></td>
                <td className="py-2 text-muted-foreground">{i.verifyResult || "-"}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted-foreground">
                  {hasData ? "ไม่มีปัญหาตามเงื่อนไขที่เลือก" : "ยังไม่มีข้อมูลปัญหาจากชีท"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
