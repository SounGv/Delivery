import { useSyncExternalStore } from "react"

/**
 * OT approval overlay. The Google Sheet is read-only (the Apps Script only serves
 * a GET payload), so approve/reject decisions can't be written back to the sheet.
 * They're kept locally in the browser instead, keyed per OT record, and layered
 * over the sheet-derived records at render time. Clearing browser storage resets
 * approvals; that's the honest limitation of a read-only data source.
 */

export type OtDecision = "APPROVED" | "REJECTED"

const STORAGE_KEY = "ot:approvals"

type Store = Record<string, OtDecision>

let store: Store = load()
const listeners = new Set<() => void>()

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Store
  } catch {
    // ignore malformed storage
  }
  return {}
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore quota/serialization errors
  }
}

/** Stable identity for an OT record across reloads (department is constant). */
export function otRecordKey(date: string, employeeName: string): string {
  return `${date}|${employeeName}`
}

/** Set a decision, or pass null to clear it back to pending. */
export function setOtDecision(key: string, decision: OtDecision | null) {
  const next: Store = { ...store }
  if (decision === null) delete next[key]
  else next[key] = decision
  store = next
  persist()
  listeners.forEach((l) => l())
}

/** Approve/reject every key in the list at once (used by the bulk action). */
export function setOtDecisionMany(keys: string[], decision: OtDecision | null) {
  const next: Store = { ...store }
  for (const key of keys) {
    if (decision === null) delete next[key]
    else next[key] = decision
  }
  store = next
  persist()
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): Store {
  return store
}

/** Reactive read of the approvals map; re-renders on any change. */
export function useOtApprovals(): Store {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
