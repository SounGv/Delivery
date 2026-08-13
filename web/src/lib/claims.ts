/** Pre-claim registration: customers fill details before shipping a return,
 * so receiving admins do not retype name / address / tracking / return address. */

export const CLAIM_STATUSES = [
  "pending_parcel",
  "received",
  "in_progress",
  "returned",
  "cancelled",
] as const

export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  pending_parcel: "รอพัสดุ",
  received: "รับเข้าแล้ว",
  in_progress: "กำลังดำเนินการ",
  returned: "ส่งคืนแล้ว",
  cancelled: "ยกเลิก",
}

export const COURIERS = [
  "Kerry Express",
  "Flash Express",
  "ไปรษณีย์ไทย",
  "J&T Express",
  "Best Express",
  "Ninja Van",
  "SPX / Shopee Express",
  "Lazada Express",
  "DHL",
  "อื่นๆ",
] as const

export interface ClaimRecord {
  id: string
  createdAt: string
  updatedAt: string
  status: ClaimStatus
  customerName: string
  phone: string
  senderAddress: string
  trackingNumber: string
  courier: string
  returnName: string
  returnPhone: string
  returnAddress: string
  sameAsSender: boolean
  brand: string
  model: string
  serialNumber: string
  orderRef: string
  issue: string
  adminNote: string
  receivedAt: string | null
}

export interface ClaimDraft {
  customerName: string
  phone: string
  senderAddress: string
  trackingNumber: string
  courier: string
  returnName: string
  returnPhone: string
  returnAddress: string
  sameAsSender: boolean
  brand: string
  model: string
  serialNumber: string
  orderRef: string
  issue: string
}

export type ClaimFieldErrors = Partial<Record<keyof ClaimDraft, string>>

export const EMPTY_CLAIM_DRAFT: ClaimDraft = {
  customerName: "",
  phone: "",
  senderAddress: "",
  trackingNumber: "",
  courier: "",
  returnName: "",
  returnPhone: "",
  returnAddress: "",
  sameAsSender: true,
  brand: "",
  model: "",
  serialNumber: "",
  orderRef: "",
  issue: "",
}

const STORAGE_KEY = "claims:records:v1"
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "")
}

export function normalizeTracking(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase()
}

export function isValidThaiPhone(raw: string): boolean {
  const digits = normalizePhone(raw)
  return /^0\d{8,9}$/.test(digits)
}

export function generateClaimId(now = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  let suffix = ""
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  for (const b of bytes) suffix += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return `CLM-${yy}${mm}${dd}-${suffix}`
}

export function validateClaimDraft(draft: ClaimDraft): ClaimFieldErrors {
  const errors: ClaimFieldErrors = {}
  if (draft.customerName.trim().length < 2) errors.customerName = "กรุณากรอกชื่อ-นามสกุล"
  if (!isValidThaiPhone(draft.phone)) errors.phone = "กรอกเบอร์โทร 9–10 หลัก ขึ้นต้นด้วย 0"
  if (draft.senderAddress.trim().length < 8) errors.senderAddress = "กรอกที่อยู่ให้ครบ รวมรหัสไปรษณีย์"
  if (normalizeTracking(draft.trackingNumber).length < 5) errors.trackingNumber = "กรอกเลขพัสดุที่ส่งเข้ามา"
  if (!draft.courier) errors.courier = "เลือกบริษัทขนส่ง"

  if (!draft.sameAsSender) {
    if (draft.returnName.trim().length < 2) errors.returnName = "กรอกชื่อผู้รับของส่งกลับ"
    if (!isValidThaiPhone(draft.returnPhone)) errors.returnPhone = "กรอกเบอร์โทรผู้รับของส่งกลับ"
    if (draft.returnAddress.trim().length < 8) errors.returnAddress = "กรอกที่อยู่ส่งกลับให้ครบ"
  }
  return errors
}

export function draftToRecord(draft: ClaimDraft, now = new Date()): ClaimRecord {
  const iso = now.toISOString()
  const same = draft.sameAsSender
  return {
    id: generateClaimId(now),
    createdAt: iso,
    updatedAt: iso,
    status: "pending_parcel",
    customerName: draft.customerName.trim(),
    phone: normalizePhone(draft.phone),
    senderAddress: draft.senderAddress.trim(),
    trackingNumber: normalizeTracking(draft.trackingNumber),
    courier: draft.courier,
    returnName: same ? draft.customerName.trim() : draft.returnName.trim(),
    returnPhone: same ? normalizePhone(draft.phone) : normalizePhone(draft.returnPhone),
    returnAddress: same ? draft.senderAddress.trim() : draft.returnAddress.trim(),
    sameAsSender: same,
    brand: draft.brand.trim(),
    model: draft.model.trim(),
    serialNumber: draft.serialNumber.trim(),
    orderRef: draft.orderRef.trim(),
    issue: draft.issue.trim(),
    adminNote: "",
    receivedAt: null,
  }
}

function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === "string" && (CLAIM_STATUSES as readonly string[]).includes(value)
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function parseClaimRecord(raw: unknown): ClaimRecord | null {
  if (typeof raw !== "object" || raw === null) return null
  const o = raw as Record<string, unknown>
  const id = asString(o.id).trim()
  if (!id) return null
  const status = isClaimStatus(o.status) ? o.status : "pending_parcel"
  return {
    id,
    createdAt: asString(o.createdAt) || new Date().toISOString(),
    updatedAt: asString(o.updatedAt) || asString(o.createdAt) || new Date().toISOString(),
    status,
    customerName: asString(o.customerName),
    phone: normalizePhone(asString(o.phone)),
    senderAddress: asString(o.senderAddress),
    trackingNumber: normalizeTracking(asString(o.trackingNumber)),
    courier: asString(o.courier),
    returnName: asString(o.returnName),
    returnPhone: normalizePhone(asString(o.returnPhone)),
    returnAddress: asString(o.returnAddress),
    sameAsSender: Boolean(o.sameAsSender),
    brand: asString(o.brand),
    model: asString(o.model),
    serialNumber: asString(o.serialNumber),
    orderRef: asString(o.orderRef),
    issue: asString(o.issue),
    adminNote: asString(o.adminNote),
    receivedAt: typeof o.receivedAt === "string" && o.receivedAt ? o.receivedAt : null,
  }
}

export function loadLocalClaims(): ClaimRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(parseClaimRecord).filter((c): c is ClaimRecord => c !== null)
  } catch {
    return []
  }
}

export function saveLocalClaims(records: ClaimRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function upsertLocalClaim(record: ClaimRecord): ClaimRecord[] {
  const next = mergeClaimLists(loadLocalClaims(), [record])
  saveLocalClaims(next)
  return next
}

export function mergeClaimLists(...lists: ClaimRecord[][]): ClaimRecord[] {
  const byId = new Map<string, ClaimRecord>()
  for (const list of lists) {
    for (const claim of list) {
      const prev = byId.get(claim.id)
      if (!prev || claim.updatedAt > prev.updatedAt) byId.set(claim.id, claim)
    }
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function findLocalClaim(id: string, phone: string): ClaimRecord | null {
  const digits = normalizePhone(phone)
  const found = loadLocalClaims().find((c) => c.id.toUpperCase() === id.trim().toUpperCase())
  if (!found) return null
  if (digits.length >= 4 && found.phone.endsWith(digits.slice(-9))) return found
  if (found.phone === digits) return found
  return null
}

export function formatClaimClipboard(claim: ClaimRecord): string {
  const lines = [
    `รหัสเคลม: ${claim.id}`,
    `สถานะ: ${CLAIM_STATUS_LABEL[claim.status]}`,
    `ชื่อ: ${claim.customerName}`,
    `เบอร์โทร: ${claim.phone}`,
    `ที่อยู่ผู้ส่ง: ${claim.senderAddress}`,
    `เลขพัสดุ: ${claim.trackingNumber}${claim.courier ? ` (${claim.courier})` : ""}`,
    `ผู้รับของส่งกลับ: ${claim.returnName}`,
    `เบอร์ส่งกลับ: ${claim.returnPhone}`,
    `ที่อยู่ส่งกลับ: ${claim.returnAddress}`,
  ]
  if (claim.brand || claim.model) lines.push(`สินค้า: ${[claim.brand, claim.model].filter(Boolean).join(" / ")}`)
  if (claim.serialNumber) lines.push(`Serial: ${claim.serialNumber}`)
  if (claim.orderRef) lines.push(`ออเดอร์/ใบเสร็จ: ${claim.orderRef}`)
  if (claim.issue) lines.push(`อาการ/เหตุผลเคลม: ${claim.issue}`)
  if (claim.adminNote) lines.push(`หมายเหตุแอดมิน: ${claim.adminNote}`)
  return lines.join("\n")
}

export function customerClaimLink(): string {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = "/claim"
  return url.toString()
}

export function customerInviteMessage(link: string): string {
  return [
    "📦 กรุณากรอกข้อมูลก่อนส่งสินค้าเคลม",
    "",
    `ลิงก์: ${link}`,
    "",
    "กรอกชื่อ ที่อยู่ เบอร์โทร เลขพัสดุที่ส่งมา และที่อยู่ส่งกลับ",
    "เมื่อกรอกเสร็จจะได้รหัสเคลม — รบกวนเขียนรหัสติดกล่องพัสดุด้วยค่ะ",
  ].join("\n")
}

export function matchesClaimQuery(claim: ClaimRecord, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [
    claim.id,
    claim.customerName,
    claim.phone,
    claim.trackingNumber,
    claim.courier,
    claim.returnName,
    claim.serialNumber,
    claim.orderRef,
    claim.brand,
    claim.model,
  ]
    .join(" ")
    .toLowerCase()
  return hay.includes(q.replace(/\s+/g, " "))
}

export function isSameLocalDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}
