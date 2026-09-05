/**
 * Frontend-only normalization of the "ปัญหาหน้างาน" sheet's free-text status
 * column into the redesign's 4-bucket model. The Sheet's own status column and
 * values are NOT changed — this only classifies what's already there.
 *
 * Unmapped/blank status falls to "not-started" (the safe default) rather than
 * ever being silently counted as closed.
 */
export type IssueBucket = "all" | "not-started" | "in-progress" | "closed"

export const ISSUE_BUCKET_LABEL: Record<IssueBucket, string> = {
  all: "ทั้งหมด",
  "not-started": "ยังไม่ดำเนินการ",
  "in-progress": "กำลังติดตาม",
  closed: "ปิดแล้ว",
}

const CLOSED_STATUS = new Set(["เสร็จสิ้น", "แก้ไขแล้ว", "ปิดงาน"])
const IN_PROGRESS_HINTS = ["กำลัง", "ระหว่าง", "ติดตาม"]

export function normalizeIssueStatus(raw: string): IssueBucket {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return "not-started"
  if (CLOSED_STATUS.has(trimmed)) return "closed"
  if (IN_PROGRESS_HINTS.some((h) => trimmed.indexOf(h) !== -1)) return "in-progress"
  return "not-started"
}
