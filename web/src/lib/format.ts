const numberFormatter = new Intl.NumberFormat("th-TH")
const percentFormatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 })

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-"
  return numberFormatter.format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-"
  return `${percentFormatter.format(value)}%`
}

export function formatDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
}

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]

/** Formats a "yyyy-MM" key. Uses an explicit Gregorian month table (not Intl)
 * to avoid th-TH locale silently switching to Buddhist-era years. */
export function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-").map(Number)
  const monthName = THAI_MONTHS_SHORT[(month ?? 1) - 1] ?? yyyyMM
  return `${monthName} ${year}`
}

export function formatYearLabel(yyyy: string): string {
  return yyyy
}

/** Formats an ISO "yyyy-MM-dd" as "dd MMM yyyy" in Gregorian (never Buddhist-era) years. */
export function formatFullDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const monthName = THAI_MONTHS_SHORT[(month ?? 1) - 1] ?? String(month)
  return `${String(day ?? 1).padStart(2, "0")} ${monthName} ${year}`
}

/** Converts a JS Date to an ISO "yyyy-MM-dd" key using local date fields (no UTC shift). */
export function isoDateOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Converts an ISO "yyyy-MM-dd" key to a local JS Date (no UTC shift). */
export function dateFromIso(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}
