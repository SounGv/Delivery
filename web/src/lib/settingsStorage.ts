const API_URL_KEY = "settings:apiUrl"
const REFRESH_MS_KEY = "settings:refreshMs"
/** How often every open tab asks the server for new data. The Apps Script web app caches each payload part
 * for several minutes and the payloads are large (the overview alone loads about 2 MB), so polling faster
 * than this only repeats the same answer. A shorter value a person saved earlier is raised to the minimum. */
export const DEFAULT_REFRESH_MS = 120_000
export const MIN_REFRESH_MS = 60_000
/** The stock-value figures are refreshed by a once-a-day sync, so that part never needs the normal pace. */
export const SLOW_REFRESH_MS = 900_000

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
  return Number.isFinite(n) && n > 0 ? Math.max(n, MIN_REFRESH_MS) : DEFAULT_REFRESH_MS
}

/** The interval for slow-changing parts: never faster than the person's own choice, never faster than SLOW_REFRESH_MS. */
export function getSlowRefreshIntervalMs(): number {
  return Math.max(getRefreshIntervalMs(), SLOW_REFRESH_MS)
}

export function setRefreshIntervalMs(ms: number) {
  localStorage.setItem(REFRESH_MS_KEY, String(ms))
}
