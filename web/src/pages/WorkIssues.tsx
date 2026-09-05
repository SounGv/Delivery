import { Fragment, useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, CircleAlert, Clock, Download, ListChecks, Send } from "lucide-react"
import { useDashboardQuery } from "@/api/queries"
import { KpiCard } from "@/components/kpi/KpiCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { downloadCsv } from "@/lib/csv"
import { cn } from "@/lib/utils"
import { ISSUE_BUCKET_LABEL, normalizeIssueStatus, type IssueBucket } from "@/lib/workIssueStatus"
import { addIssueNote, issueKey, startFollowUp, useIssueTracking } from "@/lib/workIssueTracking"
import { formatDateTime } from "@/lib/format"
import type { WorkIssue } from "@/api/types"

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

const BUCKET_TONE: Record<IssueBucket, string> = {
  all: "",
  "not-started": "border-muted-foreground/40 text-muted-foreground",
  "in-progress": "border-amber-500/40 text-amber-500",
  closed: "border-emerald-glow/40 text-emerald-glow",
}

function BucketBadge({ bucket, sheetStatus }: { bucket: IssueBucket; sheetStatus: string }) {
  return (
    <Badge variant="outline" className={cn(BUCKET_TONE[bucket])}>
      {ISSUE_BUCKET_LABEL[bucket]}
      {sheetStatus && sheetStatus !== ISSUE_BUCKET_LABEL[bucket] ? ` (${sheetStatus})` : ""}
    </Badge>
  )
}

const BUCKET_TABS: IssueBucket[] = ["all", "not-started", "in-progress", "closed"]

/** "ปัญหาหน้างาน" — workplace obstacles/issues staff run into while working
 * (unstable internet, printer/ink problems, PC crashes, etc.), from the
 * standalone "ปัญหารอแก้" sheet. Read-only; shows a redeploy hint until the
 * parser that reads that tab is live. Status/urgency/category filters plus
 * "start follow-up" + notes are a local overlay (see `workIssueTracking.ts`)
 * since the sheet itself can't be written back to. */
export function WorkIssues() {
  const { data, isLoading, isError, error } = useDashboardQuery()
  const [bucket, setBucket] = useState<IssueBucket>("all")
  const [urgency, setUrgency] = useState("all")
  const [category, setCategory] = useState("all")
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const tracking = useIssueTracking()

  const issues = useMemo(() => data?.workIssues ?? [], [data])

  if (isLoading) return <LoadingSkeletonGrid count={4} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const urgencies = [...new Set(issues.map((i) => i.urgency).filter(Boolean))].sort()
  const categories = [...new Set(issues.map((i) => i.category).filter(Boolean))].sort()

  const effectiveBucket = (i: WorkIssue): IssueBucket => {
    const sheetBucket = normalizeIssueStatus(i.status)
    if (sheetBucket === "closed") return "closed"
    const key = issueKey(i.date, i.reporter, i.detail)
    return tracking[key]?.startedFollowUp ? "in-progress" : sheetBucket
  }

  const filtered = issues.filter(
    (i) =>
      (bucket === "all" || effectiveBucket(i) === bucket) &&
      (urgency === "all" || i.urgency === urgency) &&
      (category === "all" || i.category === category)
  )
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date))

  const notStartedCount = issues.filter((i) => effectiveBucket(i) === "not-started").length
  const inProgressCount = issues.filter((i) => effectiveBucket(i) === "in-progress").length
  const closedCount = issues.filter((i) => effectiveBucket(i) === "closed").length

  const hasData = issues.length > 0

  const handleExport = () => {
    downloadCsv(
      `work-issues_${bucket}.csv`,
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
        <KpiCard title="ยังไม่ดำเนินการ" value={notStartedCount} icon={Clock} gradient="bg-gradient-to-br from-slate-500 to-slate-700" suffix="รายการ" />
        <KpiCard title="กำลังติดตาม" value={inProgressCount} icon={CircleAlert} gradient="bg-gradient-to-br from-amber-500 to-amber-600" suffix="รายการ" />
        <KpiCard title="ปิดแล้ว" value={closedCount} icon={ListChecks} gradient="bg-gradient-to-br from-emerald-glow to-brand-600" suffix="รายการ" />
      </div>

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="flex gap-1 rounded-xl border border-border p-1">
          {BUCKET_TABS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                bucket === b ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {ISSUE_BUCKET_LABEL[b]}
            </button>
          ))}
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
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 font-medium"></th>
              <th className="pb-2 font-medium">วันที่แจ้ง</th>
              <th className="pb-2 font-medium">ผู้แจ้ง</th>
              <th className="pb-2 font-medium">หมวดหมู่</th>
              <th className="pb-2 font-medium">รายละเอียดปัญหา</th>
              <th className="pb-2 font-medium">ความเร่งด่วน</th>
              <th className="pb-2 font-medium">ผู้รับผิดชอบ</th>
              <th className="pb-2 font-medium">เริ่มแก้ไข</th>
              <th className="pb-2 font-medium">กำหนดเสร็จ</th>
              <th className="pb-2 font-medium">สถานะ</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((i, idx) => {
              const key = issueKey(i.date, i.reporter, i.detail)
              const bucketForRow = effectiveBucket(i)
              const isExpanded = expandedKey === key
              const entry = tracking[key]
              const rowKey = `${key}-${idx}`
              return (
                <Fragment key={rowKey}>
                  <tr className="border-b border-white/5 align-top last:border-0">
                    <td className="py-2">
                      <button type="button" onClick={() => setExpandedKey(isExpanded ? null : key)} className="text-muted-foreground hover:text-foreground">
                        {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </td>
                    <td className="py-2 text-foreground">{i.date || "-"}</td>
                    <td className="py-2 text-foreground">{i.reporter || "-"}</td>
                    <td className="py-2 text-muted-foreground">{i.category || "-"}</td>
                    <td className="py-2 text-foreground">{i.detail || "-"}</td>
                    <td className="py-2"><UrgencyBadge urgency={i.urgency} /></td>
                    <td className="py-2 text-muted-foreground">{i.assignee || "-"}</td>
                    <td className="py-2 text-muted-foreground">{i.startDate || "-"}</td>
                    <td className="py-2 text-muted-foreground">{i.dueDate || "-"}</td>
                    <td className="py-2"><BucketBadge bucket={bucketForRow} sheetStatus={i.status} /></td>
                    <td className="py-2">
                      {bucketForRow === "not-started" && (
                        <Button size="sm" variant="outline" onClick={() => startFollowUp(key)}>
                          เริ่มติดตาม
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-white/5 last:border-0">
                      <td />
                      <td colSpan={10} className="py-3">
                        <div className="rounded-lg border border-border p-3">
                          {i.resolution && (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">วิธีแก้ไข: </span>{i.resolution}
                            </p>
                          )}
                          {i.verifyResult && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">ผลตรวจสอบ: </span>{i.verifyResult}
                            </p>
                          )}
                          {i.note && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">หมายเหตุจากชีท: </span>{i.note}
                            </p>
                          )}
                          <p className="mt-2 text-xs font-semibold text-foreground">ประวัติการติดตาม (บันทึกในเครื่องนี้เท่านั้น)</p>
                          <ul className="mt-1 space-y-1">
                            {(entry?.notes ?? []).map((n, ni) => (
                              <li key={ni} className="text-xs text-muted-foreground">
                                <span className="text-foreground">{formatDateTime(n.at)}</span> — {n.text}
                              </li>
                            ))}
                            {(!entry || entry.notes.length === 0) && (
                              <li className="text-xs text-muted-foreground">ยังไม่มีบันทึกการติดตาม</li>
                            )}
                          </ul>
                          <div className="mt-2 flex gap-2">
                            <input
                              value={expandedKey === key ? noteDraft : ""}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="พิมพ์บันทึกการติดตาม..."
                              className="w-full rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                addIssueNote(key, noteDraft)
                                setNoteDraft("")
                              }}
                            >
                              <Send className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-muted-foreground">
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
