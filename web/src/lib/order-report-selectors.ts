import type { OrderReportChannel, OrderReportDay } from "@/api/types"
import { dateFromIso } from "./format"

export function sortedOrderReportDays(days: OrderReportDay[]): OrderReportDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date))
}

/** UI-level channel selection — "all" combines both channels into one row per date. */
export type ChannelFilter = OrderReportChannel | "all"

export const CHANNEL_FILTER_LABELS: Record<ChannelFilter, string> = {
  all: "ออนไลน์ + ออฟไลน์",
  online: "ออนไลน์",
  offline: "ออฟไลน์",
}

const SUM_FIELDS = [
  "effSales", "effOrders", "totalOrders", "parcels", "totalRevenue", "sellerSubsidy",
  "productSales", "origPrice", "sales", "refundAmount", "refundOrders", "refundCustomers",
  "cancelledAmount", "cancelledOrders", "discountCode",
] as const

/** Combines same-date rows from every channel into one row per date. AOV and
 * refundRate are RECOMPUTED from the combined totals (sales/totalOrders and
 * refundOrders/totalOrders*100, respectively — confirmed against the sheet's own
 * per-row math) rather than averaged, since averaging two already-derived ratios
 * would not equal the true combined ratio. */
export function combineChannels(days: OrderReportDay[]): OrderReportDay[] {
  const byDate = new Map<string, OrderReportDay[]>()
  for (const d of days) {
    const arr = byDate.get(d.date)
    if (arr) arr.push(d)
    else byDate.set(d.date, [d])
  }

  const out: OrderReportDay[] = []
  for (const [date, rows] of byDate) {
    const only = rows[0]
    if (rows.length === 1 && only) {
      out.push(only)
      continue
    }
    const sums = Object.fromEntries(
      SUM_FIELDS.map((key) => [key, rows.reduce((s, r) => s + r[key], 0)])
    ) as Record<(typeof SUM_FIELDS)[number], number>

    out.push({
      date,
      channel: "online", // synthetic combined row; channel is not meaningful here
      ...sums,
      refundRate: sums.totalOrders > 0 ? (sums.refundOrders / sums.totalOrders) * 100 : 0,
      aov: sums.totalOrders > 0 ? sums.sales / sums.totalOrders : 0,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Applies the channel filter: a single channel's rows as-is, or every channel
 * combined into one row per date when "all" is selected. */
export function applyChannelFilter(days: OrderReportDay[], channel: ChannelFilter): OrderReportDay[] {
  if (channel === "all") return combineChannels(days)
  return days.filter((d) => d.channel === channel)
}

export interface OrderReportTotals {
  totalEffSales: number
  totalEffOrders: number
  totalOrders: number
  /** "จำนวนพัสดุ". */
  totalParcels: number
  totalCancelledOrders: number
  totalCancelledAmount: number
  totalDiscountCode: number
  /** "ยอดขาย" — a distinct column from effSales, used (weighted) for AOV. */
  totalSales: number
  /** "รายได้รวม". */
  totalRevenue: number
  /** "เงินอุดหนุนจากผู้ขาย". */
  totalSellerSubsidy: number
  /** "ยอดขายสินค้า". */
  totalProductSales: number
  /** "ราคาสินค้าเดิม" — before any discount. */
  totalOrigPrice: number
  /** "จำนวนคำสั่งซื้อที่คืนเงิน" — despite the name, this is a money amount, not a count. */
  totalRefundAmount: number
  /** "คำสั่งซื้อที่คืนเงิน". */
  totalRefundOrders: number
  /** "ลูกค้าที่คืนเงิน". */
  totalRefundCustomers: number
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
  let totalParcels = 0
  let totalCancelledOrders = 0
  let totalCancelledAmount = 0
  let totalDiscountCode = 0
  let totalSales = 0
  let totalRevenue = 0
  let totalSellerSubsidy = 0
  let totalProductSales = 0
  let totalOrigPrice = 0
  let totalRefundAmount = 0
  let totalRefundOrders = 0
  let totalRefundCustomers = 0
  let refundRateSum = 0

  for (const d of days) {
    totalEffSales += d.effSales
    totalEffOrders += d.effOrders
    totalOrders += d.totalOrders
    totalParcels += d.parcels
    totalCancelledOrders += d.cancelledOrders
    totalCancelledAmount += d.cancelledAmount
    totalDiscountCode += d.discountCode
    totalSales += d.sales
    totalRevenue += d.totalRevenue
    totalSellerSubsidy += d.sellerSubsidy
    totalProductSales += d.productSales
    totalOrigPrice += d.origPrice
    totalRefundAmount += d.refundAmount
    totalRefundOrders += d.refundOrders
    totalRefundCustomers += d.refundCustomers
    refundRateSum += d.refundRate
  }

  const nDays = days.length
  return {
    totalEffSales,
    totalEffOrders,
    totalOrders,
    totalParcels,
    totalCancelledOrders,
    totalCancelledAmount,
    totalDiscountCode,
    totalSales,
    totalRevenue,
    totalSellerSubsidy,
    totalProductSales,
    totalOrigPrice,
    totalRefundAmount,
    totalRefundOrders,
    totalRefundCustomers,
    cancelRate: totalOrders > 0 ? (totalCancelledOrders / totalOrders) * 100 : 0,
    avgRefundRate: nDays > 0 ? refundRateSum / nDays : 0,
    weightedAov: totalOrders > 0 ? totalSales / totalOrders : 0,
    nDays,
  }
}

export interface ChannelComparisonTotals {
  online: OrderReportTotals
  offline: OrderReportTotals
}

/** Online vs offline totals for the same date range, independent of whatever
 * single-channel filter the rest of the page is using — lets a "compare
 * channels" panel show both sides together. */
export function computeChannelComparison(days: OrderReportDay[]): ChannelComparisonTotals {
  return {
    online: computeOrderReportTotals(days.filter((d) => d.channel === "online")),
    offline: computeOrderReportTotals(days.filter((d) => d.channel === "offline")),
  }
}

export interface MonthlyChannelRow {
  monthKey: string
  onlineSales: number
  onlineRefund: number
  onlineNet: number
  onlineOrders: number
  offlineSales: number
  offlineRefund: number
  offlineNet: number
  offlineOrders: number
}

/** Same online-vs-offline split as computeChannelComparison, bucketed by
 * calendar month. */
export function monthlyChannelComparison(days: OrderReportDay[]): MonthlyChannelRow[] {
  const byMonth = new Map<
    string,
    { onlineSales: number; onlineRefund: number; onlineOrders: number; offlineSales: number; offlineRefund: number; offlineOrders: number }
  >()
  for (const d of days) {
    const key = d.date.slice(0, 7)
    const acc =
      byMonth.get(key) ?? { onlineSales: 0, onlineRefund: 0, onlineOrders: 0, offlineSales: 0, offlineRefund: 0, offlineOrders: 0 }
    if (d.channel === "online") {
      acc.onlineSales += d.effSales
      acc.onlineRefund += d.refundAmount
      acc.onlineOrders += d.effOrders
    } else {
      acc.offlineSales += d.effSales
      acc.offlineRefund += d.refundAmount
      acc.offlineOrders += d.effOrders
    }
    byMonth.set(key, acc)
  }
  return [...byMonth.entries()]
    .map(([monthKey, v]) => ({
      monthKey,
      onlineNet: v.onlineSales - v.onlineRefund,
      offlineNet: v.offlineSales - v.offlineRefund,
      ...v,
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
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

