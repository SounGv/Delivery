import type { ApiErrorResponse, DashboardResponse, PayloadPartPath } from "./types"
import { getApiUrlOverride } from "@/lib/settingsStorage"

function isErrorResponse(data: unknown): data is ApiErrorResponse {
  return typeof data === "object" && data !== null && "error" in data
}

/** One slice of the backend payload (see PAYLOAD_PARTS_ in apps-script/Code.js).
 * The core slice is light and drives every page; the three heavy slices are only
 * fetched by the page that shows them. */
export async function fetchPayloadPart<T>(path: PayloadPartPath, signal?: AbortSignal): Promise<T> {
  const baseUrl = getApiUrlOverride() || import.meta.env.VITE_APPS_SCRIPT_URL
  if (!baseUrl) {
    throw new Error("ยังไม่ได้ตั้งค่า Apps Script URL — ตั้งค่าได้ที่หน้า Settings")
  }

  const url = `${baseUrl}?path=${path}`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Apps Script request failed with status ${res.status}`)
  }

  const data: unknown = await res.json()
  if (isErrorResponse(data)) {
    throw new Error(data.error)
  }
  return data as T
}

export function fetchDashboard(signal?: AbortSignal): Promise<DashboardResponse> {
  return fetchPayloadPart<DashboardResponse>("core", signal)
}
