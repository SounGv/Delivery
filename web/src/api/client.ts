import type { ApiErrorResponse, DashboardResponse, PayloadPartPath } from "./types"
import { getApiUrlOverride, setApiUrlOverride } from "@/lib/settingsStorage"

function isErrorResponse(data: unknown): data is ApiErrorResponse {
  return typeof data === "object" && data !== null && "error" in data
}

// Endpoint names of the cache service in api/ (api/main.py PART_ENDPOINTS).
const CACHE_API_ENDPOINTS: Record<PayloadPartPath, string> = {
  core: "core",
  workPerformance: "work-performance",
  cancelled: "cancelled",
  focus: "focus",
  restock: "restock",
  refunds: "refunds",
  stockValue: "stock-value",
}

async function fetchJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`${label} request failed with status ${res.status}`)
  }

  const data: unknown = await res.json()
  if (isErrorResponse(data)) {
    throw new Error(data.error)
  }
  return data as T
}

/** One slice of the backend payload (see PAYLOAD_PARTS_ in apps-script/Code.js).
 * The core slice is light and drives every page; the three heavy slices are only
 * fetched by the page that shows them. Reads from the cache service (api/) when
 * VITE_API_BASE_URL is set, falling back to Apps Script if that service is down;
 * a URL typed into Settings always means "call this Apps Script directly". */
export async function fetchPayloadPart<T>(path: PayloadPartPath, signal?: AbortSignal): Promise<T> {
  const appsScriptOverride = getApiUrlOverride()
  const defaultAppsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL
  const appsScriptUrl = appsScriptOverride || defaultAppsScriptUrl
  const cacheApiBase = appsScriptOverride ? undefined : import.meta.env.VITE_API_BASE_URL

  if (cacheApiBase) {
    try {
      return await fetchJson<T>(`${cacheApiBase}/api/${CACHE_API_ENDPOINTS[path]}`, "Cache API", signal)
    } catch (error) {
      if (signal?.aborted || !appsScriptUrl) throw error
      // cache service unreachable or still warming: fall through to Apps Script
    }
  }

  if (!appsScriptUrl) {
    throw new Error("ยังไม่ได้ตั้งค่า Apps Script URL — ตั้งค่าได้ที่หน้า Settings")
  }
  try {
    return await fetchJson<T>(`${appsScriptUrl}?path=${path}`, "Apps Script", signal)
  } catch (error) {
    // A URL saved in Settings can point at an older Apps Script deployment that
    // predates the split payload; it answers "Unknown path: core" and can never
    // work with this build. Drop it and use the built-in URL rather than leaving
    // that browser stuck on an error screen.
    const savedUrlIsOutdated =
      appsScriptOverride && defaultAppsScriptUrl && appsScriptOverride !== defaultAppsScriptUrl && isUnknownPathError(error)
    if (!savedUrlIsOutdated) throw error
    setApiUrlOverride(null)
    return fetchJson<T>(`${defaultAppsScriptUrl}?path=${path}`, "Apps Script", signal)
  }
}

function isUnknownPathError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Unknown path")
}

export function fetchDashboard(signal?: AbortSignal): Promise<DashboardResponse> {
  return fetchPayloadPart<DashboardResponse>("core", signal)
}
