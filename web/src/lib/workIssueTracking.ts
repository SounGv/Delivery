import { useSyncExternalStore } from "react"

/**
 * Local follow-up overlay for "ปัญหาหน้างาน" issues. The Google Sheet is
 * read-only, so "start follow-up" and conversation notes can't be written
 * back to it — they're kept in the browser instead, keyed per issue, and
 * layered over the sheet-derived status at render time. Same pattern as
 * `otApprovals.ts`. Clearing browser storage resets this; that's the honest
 * limitation of a read-only data source.
 */

export interface IssueNote {
  at: string
  text: string
}

interface IssueTrackingEntry {
  startedFollowUp: boolean
  notes: IssueNote[]
}

const STORAGE_KEY = "work-issues:tracking"

type Store = Record<string, IssueTrackingEntry>

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

/** Stable identity for an issue across reloads — the sheet has no issue-ID column. */
export function issueKey(date: string, reporter: string, detail: string): string {
  return `${date}|${reporter}|${detail}`.slice(0, 300)
}

function entryFor(key: string): IssueTrackingEntry {
  return store[key] ?? { startedFollowUp: false, notes: [] }
}

export function startFollowUp(key: string) {
  store = { ...store, [key]: { ...entryFor(key), startedFollowUp: true } }
  persist()
  listeners.forEach((l) => l())
}

export function addIssueNote(key: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  const entry = entryFor(key)
  store = { ...store, [key]: { ...entry, notes: [...entry.notes, { at: new Date().toISOString(), text: trimmed }] } }
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

/** Reactive read of the tracking map; re-renders on any change. */
export function useIssueTracking(): Store {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
