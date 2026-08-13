import type { ClaimRecord, ClaimStatus } from "@/lib/claims"
import { parseClaimRecord } from "@/lib/claims"
import { getApiUrlOverride } from "@/lib/settingsStorage"

function claimsApiUrl(): string | null {
  const base = getApiUrlOverride() || import.meta.env.VITE_APPS_SCRIPT_URL
  return base ? String(base) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export async function fetchRemoteClaims(signal?: AbortSignal): Promise<ClaimRecord[] | null> {
  const base = claimsApiUrl()
  if (!base) return null
  const url = `${base}?path=claims`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`โหลดรายการเคลมไม่สำเร็จ (${res.status})`)
  const data: unknown = await res.json()
  if (isRecord(data) && typeof data.error === "string") throw new Error(data.error)
  const rows = isRecord(data) && Array.isArray(data.claims) ? data.claims : Array.isArray(data) ? data : []
  return rows.map(parseClaimRecord).filter((c): c is ClaimRecord => c !== null)
}

/** text/plain avoids a CORS preflight against Google Apps Script. */
async function postClaimAction(body: Record<string, unknown>): Promise<ClaimRecord | null> {
  const base = claimsApiUrl()
  if (!base) return null
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`บันทึกเคลมไม่สำเร็จ (${res.status})`)
  const data: unknown = await res.json()
  if (isRecord(data) && typeof data.error === "string") throw new Error(data.error)
  const raw = isRecord(data) ? (data.claim ?? data) : data
  return parseClaimRecord(raw)
}

export async function submitRemoteClaim(claim: ClaimRecord): Promise<ClaimRecord | null> {
  return postClaimAction({ action: "createClaim", claim })
}

export async function updateRemoteClaimStatus(
  id: string,
  status: ClaimStatus,
  adminNote?: string
): Promise<ClaimRecord | null> {
  return postClaimAction({ action: "updateClaim", id, status, adminNote })
}
