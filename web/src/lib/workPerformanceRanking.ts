import type { WorkPerformanceEmployee } from "@/api/types"
import type { EmployeeMetric } from "@/lib/workforce"

/**
 * Feeds the same ranking system already used for the online team (Podium/
 * RankingList/rankByMetric/computeRankDeltas — see lib/workforce.ts) with
 * BigSeller-sourced work-performance data instead of the legacy manually-typed
 * employee sheet. Nothing in workforce.ts had to change: EmployeeMetric is a
 * plain data shape, not tied to the old Employee type.
 *
 * "พัสดุ" = พิมพ์ใบปะหน้า + PDA หยิบของ per day (confirmed with the user — not
 * จำนวนรวมพัสดุที่หยิบ, which is a different BigSeller column). "สินค้า" =
 * จำนวนรวม SKU ที่หยิบ, the closest BigSeller analogue to "distinct items handled".
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
      for (const d of dates) {
        const m = e.byDate[d]
        if (!m) continue
        const dayParcels = m.printLabel + m.pdaPick
        if (dayParcels > 0) activeDays += 1
        parcels += dayParcels
        items += m.pickSku
      }
      const productivity = activeDays > 0 ? parcels / activeDays : 0
      const pctTarget = targetPerPerson > 0 ? (productivity / targetPerPerson) * 100 : null
      return { name: e.name, parcels, items, activeDays, productivity, pctTarget }
    })
    .filter((m) => m.activeDays > 0)
}
