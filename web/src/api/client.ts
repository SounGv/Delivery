import type { ApiErrorResponse, DashboardResponse } from "./types"
import { getApiUrlOverride } from "@/lib/settingsStorage"

function isErrorResponse(data: unknown): data is ApiErrorResponse {
  return typeof data === "object" && data !== null && "error" in data
}

export async function fetchDashboard(signal?: AbortSignal): Promise<DashboardResponse> {
  const baseUrl = getApiUrlOverride() || import.meta.env.VITE_APPS_SCRIPT_URL
  if (!baseUrl) {
    throw new Error("ยังไม่ได้ตั้งค่า Apps Script URL — ตั้งค่าได้ที่หน้า Settings")
  }

  const url = `${baseUrl}?path=dashboard`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Apps Script request failed with status ${res.status}`)
  }

  const data: unknown = await res.json()
  if (isErrorResponse(data)) {
    throw new Error(data.error)
  }
  return data as DashboardResponse
}
