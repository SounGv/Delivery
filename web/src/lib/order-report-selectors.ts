import type { OrderReportDay } from "@/api/types"
import { dateFromIso } from "./format"

export function sortedOrderReportDays(days: OrderReportDay[]): OrderReportDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date))
}

export interface OrderReportTotals {
  totalEffSales: number
  totalEffOrders: number
  totalOrders: number
  totalCancelledOrders: number
  totalCancelledAmount: number
  totalDiscountCode: number
  /** Cancelled orders / total orders, as a percent. */
  cancelRate: number
  /** Mean of each day's refund-rate percent (matches what the sheet already computes per day). */
  avgRefundRate: number
  /** Total "ยอดขาย" / total orders — weighted so busier days count more than a simple day-average. */
  weightedAov: number
  nDays: number
}

export function computeOrderReportTotals(days: OrderReportDay[]): OrderReportTotals {
  let totalEffSales = 0
  let totalEffOrders = 0
  let totalOrders = 0
  let totalCancelledOrders = 0
  let totalCancelledAmount = 0
  let totalDiscountCode = 0
  let totalSales = 0
  let refundRateSum = 0

  for (const d of days) {
    totalEffSales += d.effSales
    totalEffOrders += d.effOrders
    totalOrders += d.totalOrders
    totalCancelledOrders += d.cancelledOrders
    totalCancelledAmount += d.cancelledAmount
    totalDiscountCode += d.discountCode
    totalSales += d.sales
    refundRateSum += d.refundRate
  }

  const nDays = days.length
  return {
    totalEffSales,
    totalEffOrders,
    totalOrders,
    totalCancelledOrders,
    totalCancelledAmount,
    totalDiscountCode,
    cancelRate: totalOrders > 0 ? (totalCancelledOrders / totalOrders) * 100 : 0,
    avgRefundRate: nDays > 0 ? refundRateSum / nDays : 0,
    weightedAov: totalOrders > 0 ? totalSales / totalOrders : 0,
    nDays,
  }
}

export interface WeekBucket {
  label: string
  startDate: string
  endDate: string
  sales: number
  dayCount: number
}

/** Groups sorted days into consecutive 7-day buckets starting from the first date —
 * a plain sliding window, not calendar (ISO) weeks, since the data rarely starts on a Monday. */
export function weeklySalesBuckets(sortedDays: OrderReportDay[]): WeekBucket[] {
  const buckets: WeekBucket[] = []
  for (let i = 0; i < sortedDays.length; i += 7) {
    const chunk = sortedDays.slice(i, i + 7)
    const first = chunk[0]
    const last = chunk[chunk.length - 1]
    if (!first || !last) continue
    const sales = chunk.reduce((s, d) => s + d.effSales, 0)
    buckets.push({
      label: `${shortLabel(first.date)}-${shortLabel(last.date)}`,
      startDate: first.date,
      endDate: last.date,
      sales,
      dayCount: chunk.length,
    })
  }
  return buckets
}

function shortLabel(iso: string): string {
  const [, month, day] = iso.split("-").map(Number)
  return `${day}/${month}`
}

export const WEEKDAY_LABELS_TH = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]
export const WEEKDAY_LABELS_TH_FULL = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]

/** Monday-first weekday index (0=จันทร์ … 6=อาทิตย์), converted from JS's Sunday-first getDay(). */
export function mondayFirstWeekday(iso: string): number {
  return (dateFromIso(iso).getDay() + 6) % 7
}

/** Average effective-order sales for each day of the week, Monday-first. */
export function weekdayAverages(days: OrderReportDay[]): number[] {
  const sums = new Array(7).fill(0)
  const counts = new Array(7).fill(0)
  for (const d of days) {
    const wd = mondayFirstWeekday(d.date)
    sums[wd] += d.effSales
    counts[wd] += 1
  }
  return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0))
}

/** Top/bottom N days by effective-order sales. */
export function topBottomDays(sortedDays: OrderReportDay[], n: number): { top: OrderReportDay[]; bottom: OrderReportDay[] } {
  const byDesc = [...sortedDays].sort((a, b) => b.effSales - a.effSales)
  return { top: byDesc.slice(0, n), bottom: byDesc.slice(-n).reverse() }
}

export function peakDay(sortedDays: OrderReportDay[]): OrderReportDay | null {
  const first = sortedDays[0]
  if (!first) return null
  return sortedDays.reduce((best, d) => (d.effSales > best.effSales ? d : best), first)
}
