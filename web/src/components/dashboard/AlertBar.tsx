import { AlertTriangle, CheckCircle2 } from "lucide-react"
import type { FollowUpRow } from "@/lib/dashboard-selectors"
import type { WorkIssue } from "@/api/types"

// Duplicated (small, deliberately) from WorkIssues.tsx's own resolved-status set —
// a shared `normalizeIssueStatus` lands in the Issues/Follow-up page rework.
const RESOLVED_STATUS = new Set(["เสร็จสิ้น", "แก้ไขแล้ว", "ปิดงาน"])

interface AlertBarProps {
  followUpRows: FollowUpRow[]
  workIssues?: WorkIssue[]
}

/** Top-of-page banner surfacing what needs a manager's attention today — placed
 * before any KPI card or ranking, per the redesign's "10-second answer" goal. */
export function AlertBar({ followUpRows, workIssues }: AlertBarProps) {
  const belowTargetCount = followUpRows.filter((r) => r.status === "below-target").length
  const openIssues = (workIssues ?? []).filter((i) => !RESOLVED_STATUS.has((i.status ?? "").trim())).length

  if (belowTargetCount === 0 && openIssues === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-glow/30 bg-emerald-glow/10 px-4 py-2.5 text-sm text-emerald-glow">
        <CheckCircle2 className="size-4 shrink-0" />
        ไม่มีรายการที่ต้องติดตามเร่งด่วนวันนี้
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="font-medium">ต้องติดตามวันนี้:</span>
      {belowTargetCount > 0 && <span>พนักงานต่ำกว่าเป้า {belowTargetCount} คน</span>}
      {belowTargetCount > 0 && openIssues > 0 && <span className="opacity-40">·</span>}
      {openIssues > 0 && <span>ปัญหาหน้างานที่ยังไม่ปิด {openIssues} รายการ</span>}
    </div>
  )
}
