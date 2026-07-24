const API_URL_KEY = "settings:apiUrl"
const REFRESH_MS_KEY = "settings:refreshMs"
export const DEFAULT_REFRESH_MS = 5000

export function getApiUrlOverride(): string | null {
  return localStorage.getItem(API_URL_KEY)
}

export function setApiUrlOverride(url: string | null) {
  if (url) localStorage.setItem(API_URL_KEY, url)
  else localStorage.removeItem(API_URL_KEY)
}

export function getRefreshIntervalMs(): number {
  const raw = localStorage.getItem(REFRESH_MS_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REFRESH_MS
}

export function setRefreshIntervalMs(ms: number) {
  localStorage.setItem(REFRESH_MS_KEY, String(ms))
}
