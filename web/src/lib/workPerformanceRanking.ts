import type { WorkPerformanceEmployee, WorkPerformanceMetrics } from "@/api/types"
import type { EmployeeMetric } from "@/lib/workforce"

/**
 * "พัสดุ" (total parcel-touches across the whole fulfilment flow: pick → pack →
 * inspect → ship). Earlier this was พิมพ์ใบปะหน้า + PDA หยิบของ, but checking
 * real totals showed those two are near-duplicates of จำนวนรวมพัสดุที่หยิบ
 * itself (same picking activity measured two ways, off by only a few units per
 * person) — summing them double-counted picking and completely ignored anyone
 * who mostly packs or ships (e.g. one person with 6,700+ จัดส่ง but under 250
 * picks ranked near the bottom). จำนวนพัสดุทั้งหมดที่คัดแยก is always 0 in this
 * warehouse's export (never used) so it's omitted, not because it's excluded on
 * principle.
 */
export function dailyParcelTotal(m: WorkPerformanceMetrics): number {
  return m.pickParcels + m.packParcels + m.inspectParcels + m.ship
}

/** "สินค้า" — distinct SKUs touched across pick/pack/inspect. */
export function dailyItemTotal(m: WorkPerformanceMetrics): number {
  return m.pickSku + m.packSku + m.inspectSku
}

/**
 * Feeds the same ranking system already used for the online team (Podium/
 * RankingList/rankByMetric/computeRankDeltas — see lib/workforce.ts) with
 * BigSeller-sourced work-performance data instead of the legacy manually-typed
 * employee sheet. Nothing in workforce.ts had to change: EmployeeMetric is a
 * plain data shape, not tied to the old Employee type. pdaPick/printLabel/
 * pickWaveCount/pickSku are also range-summed here so the ranking can be
 * switched to any one of them individually (RankingMetric) — kept as
 * separate fields, never combined into one composite, per explicit request.
 */
export function computeWpEmployeeMetrics(
  employees: WorkPerformanceEmployee[],
  dates: string[],
  targetPerPerson: number
): EmployeeMetric[] {
  return employees
    .map((e) => {
      let parcels = 0
      let items = 0
      let activeDays = 0
      let pdaPick = 0
      let printLabel = 0
      let pickWaveCount = 0
      let pickSku = 0
      for (const d of dates) {
        const m = e.byDate[d]
        if (!m) continue
        const dayParcels = dailyParcelTotal(m)
        if (dayParcels > 0) activeDays += 1
        parcels += dayParcels
        items += dailyItemTotal(m)
        pdaPick += m.pdaPick
        printLabel += m.printLabel
        pickWaveCount += m.pickWaveCount
        pickSku += m.pickSku
      }
      const productivity = activeDays > 0 ? parcels / activeDays : 0
      const pctTarget = targetPerPerson > 0 ? (productivity / targetPerPerson) * 100 : null
      return { name: e.name, parcels, items, activeDays, productivity, pctTarget, pdaPick, printLabel, pickWaveCount, pickSku }
    })
    .filter((m) => m.activeDays > 0)
}

