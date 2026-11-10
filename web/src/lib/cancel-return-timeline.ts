import type { CancelledRow, RefundCase, RestockRow } from "@/api/types"
import type { Tone } from "@/components/returns/ReturnsUi"

/**
 * One list for "สินค้ายกเลิก / ตีกลับ / สูญหาย" so they can be looked at by month and by day.
 * Three sources, three kinds:
 *   cancel  the cancelled-order scan log           (date = the order's own date)
 *   return  gv-returns-sync cn-restock, not lost    (date = request date, else the day the parcel arrived)
 *   lost    parcels the platform marks as lost      (date as above; refund cases that are not in the
 *                                                    restock tab at all have no date and go to NO_DATE)
 * A parcel that is in both the restock tab and the refund tab is ONE line: the restock row carries
 * the date, the refund tab supplies the money status — otherwise lost parcels would count twice.
 */
export type TimelineKind = "cancel" | "return" | "lost"

export const KIND_LABEL: Record<TimelineKind, string> = { cancel: "ยกเลิก", return: "ตีกลับ", lost: "สูญหาย" }
export const KINDS: TimelineKind[] = ["cancel", "return", "lost"]

/** Bucket key for lines that have no usable date. */
export const NO_DATE = "__no_date__"

export interface TimelineStatus {
  label: string
  tone: Tone
}

export interface TimelineItem {
  id: string
  kind: TimelineKind
  /** yyyy-MM-dd, or null when the source has no date for this line. */
  date: string | null
  /** Which date `date` is, e.g. "ยื่นคำขอ". */
  dateNote: string
  channel: string
  sku: string
  qty: number
  orderNo: string
  packageNo: string
  status: TimelineStatus
  /** Secondary label next to the status (stock-deducted flag, store…). */
  tag: string
  /** Free text for the last column (money, who printed…). */
  extra: string
}

const stripLeadingSymbols = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "").trim()
const dayOf = (dateTime: string) => (dateTime ? dateTime.slice(0, 10) : "")
const money = (n: number | null | undefined) => (n && n > 0 ? `${Math.round(n).toLocaleString("th-TH")} ฿` : "")

function cancelStatus(r: CancelledRow): TimelineStatus {
  switch (r.status) {
    case "รอตรวจสอบ":
      return { label: "รอตรวจสอบ", tone: "warn" }
    case "รับแล้ว":
      return { label: "รับแล้ว", tone: "ok" }
    case "ไม่ตรง":
      return { label: "ไม่ตรง", tone: "danger" }
    case "ปิดงาน":
      return { label: r.closedReason ? `ปิดงาน · ${r.closedReason}` : "ปิดงาน", tone: "ok" }
  }
}

function returnStatus(r: RestockRow): TimelineStatus {
  const receipt = stripLeadingSymbols(r.receiptStatus)
  if (receipt === "ได้เงินคืนแล้ว") return { label: "ได้เงินคืนแล้ว", tone: "ok" }
  if (receipt === "รับบางส่วน" || r.stockInStatus === "Stock-In บางส่วน") return { label: "Stock-In บางส่วน", tone: "info" }
  if (receipt === "ไม่ Stock-In" || r.stockInStatus === "ไม่ Stock-In") return { label: "ไม่ Stock-In", tone: "danger" }
  return { label: "ยังไม่ Stock-In", tone: "warn" }
}

function lostStatus(paidText: string | undefined, r?: RestockRow): TimelineStatus {
  if (paidText === "ได้เงินคืนแล้ว") return { label: "ได้เงินคืนแล้ว", tone: "ok" }
  if (paidText === "รอเงินคืนจากขนส่ง") return { label: "รอเงินคืนจากขนส่ง", tone: "warn" }
  if (r && stripLeadingSymbols(r.receiptStatus) === "ได้เงินคืนแล้ว") return { label: "ได้เงินคืนแล้ว", tone: "ok" }
  return { label: "ยังไม่มีบันทึก", tone: "danger" }
}

export function buildTimelineItems(cancelled: CancelledRow[], restock: RestockRow[], refunds: RefundCase[]): TimelineItem[] {
  const refundByPackage = new Map<string, RefundCase>()
  for (const f of refunds) if (f.packageNo && !refundByPackage.has(f.packageNo)) refundByPackage.set(f.packageNo, f)
  const restockPackages = new Set(restock.map((r) => r.packageNo).filter(Boolean))

  const items: TimelineItem[] = []

  cancelled.forEach((r, i) => {
    items.push({
      id: `c:${r.bsParcel || r.orderNo}:${r.sku}:${i}`,
      kind: "cancel",
      date: r.date || null,
      dateNote: "วันที่ออเดอร์",
      channel: r.channel,
      sku: r.sku,
      qty: r.qty,
      orderNo: r.orderNo,
      packageNo: r.bsParcel,
      status: cancelStatus(r),
      tag: r.stockDeducted ? "ตัดสต็อกแล้ว (T1)" : "ยังไม่ตัดสต็อก (T2)",
      extra: r.printer ? `พิมพ์โดย ${r.printer}` : "",
    })
  })

  restock.forEach((r, i) => {
    const requested = dayOf(r.requestedAt)
    const arrived = dayOf(r.arrivedAt)
    const lost = r.returnStatus === "สูญหาย"
    const refund = refundByPackage.get(r.packageNo)
    items.push({
      id: `r:${r.packageNo || r.orderNo}:${r.sku}:${i}`,
      kind: lost ? "lost" : "return",
      date: requested || arrived || null,
      dateNote: requested ? "ยื่นคำขอ" : arrived ? "ของถึงคลัง" : "",
      channel: r.platform,
      sku: r.sku,
      qty: r.qty,
      orderNo: r.orderNo,
      packageNo: r.packageNo,
      status: lost ? lostStatus(refund?.caseResult, r) : returnStatus(r),
      tag: r.origin,
      extra: money(r.refundAmount),
    })
  })

  refunds.forEach((f, i) => {
    if (restockPackages.has(f.packageNo)) return // already counted through its restock row
    items.push({
      id: `f:${f.packageNo || f.orderNo}:${f.sku}:${i}`,
      kind: "lost",
      date: null,
      dateNote: "",
      channel: f.channel,
      sku: f.sku,
      qty: f.qty,
      orderNo: f.orderNo,
      packageNo: f.packageNo,
      status: lostStatus(f.caseResult),
      tag: f.platformStatus,
      extra: money(f.sellPrice),
    })
  })

  return items
}

/** Waiting on someone, or a problem — the lines the team still has to act on. */
export const needsAction = (item: TimelineItem) => item.status.tone === "warn" || item.status.tone === "danger"

export interface Bucket {
  key: string
  cancel: number
  ret: number
  lost: number
  total: number
  open: number
}

const emptyBucket = (key: string): Bucket => ({ key, cancel: 0, ret: 0, lost: 0, total: 0, open: 0 })

function addTo(b: Bucket, item: TimelineItem) {
  if (item.kind === "cancel") b.cancel += 1
  else if (item.kind === "return") b.ret += 1
  else b.lost += 1
  b.total += 1
  if (needsAction(item)) b.open += 1
}

export const monthOf = (date: string) => date.slice(0, 7)

/** Newest month first; lines without a date come last as NO_DATE. */
export function bucketsByMonth(items: TimelineItem[]): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const it of items) {
    const key = it.date ? monthOf(it.date) : NO_DATE
    const b = map.get(key) ?? emptyBucket(key)
    addTo(b, it)
    map.set(key, b)
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === NO_DATE) return 1
    if (b.key === NO_DATE) return -1
    return b.key.localeCompare(a.key)
  })
}

/** Every calendar day of `month` up to the later of today and the last dated line, newest first,
 * so a day with nothing logged shows as 0 instead of silently missing. */
export function bucketsByDay(items: TimelineItem[], month: string, todayIso: string): Bucket[] {
  const map = new Map<string, Bucket>()
  let last = ""
  for (const it of items) {
    if (!it.date || monthOf(it.date) !== month) continue
    const b = map.get(it.date) ?? emptyBucket(it.date)
    addTo(b, it)
    map.set(it.date, b)
    if (it.date > last) last = it.date
  }
  const [y, m] = month.split("-").map(Number)
  const daysInMonth = new Date(y ?? 1970, m ?? 1, 0).getDate()
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`
  const limitCandidate = todayIso > last ? todayIso : last
  const limit = limitCandidate && limitCandidate < monthEnd ? limitCandidate : monthEnd
  const out: Bucket[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`
    if (key > limit) break
    out.push(map.get(key) ?? emptyBucket(key))
  }
  return out.reverse()
}

/** Months that have at least one dated line, newest first. */
export const monthsWithData = (items: TimelineItem[]) =>
  bucketsByMonth(items)
    .map((b) => b.key)
    .filter((k) => k !== NO_DATE)
