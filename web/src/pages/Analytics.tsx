import { lazy, Suspense, useState } from "react"
import { useTeamDashboard } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Skeleton } from "@/components/ui/skeleton"
import { collectIncidents, incidentsByMonthAndCategory } from "@/lib/dashboard-selectors"

const ShopSlaTrendChart = lazy(() =>
  import("@/components/analytics/ShopSlaTrendChart").then((m) => ({ default: m.ShopSlaTrendChart }))
)
const CategoryIncidentTrendChart = lazy(() =>
  import("@/components/analytics/CategoryIncidentTrendChart").then((m) => ({ default: m.CategoryIncidentTrendChart }))
)

export function Analytics() {
  const { data, isLoading, isError, error } = useTeamDashboard()
  const [selectedShop, setSelectedShop] = useState<string | null>(null)

  if (isLoading) return <LoadingSkeletonGrid count={2} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const shop = data.shopSla.find((s) => s.shop === selectedShop) ?? data.shopSla[0]
  const trend = incidentsByMonthAndCategory(collectIncidents(data))

  return (
    <div className="space-y-4">
      {shop && (
        <div className="glass-panel rounded-2xl p-4">
          <label className="block text-[11px] text-muted-foreground" htmlFor="shop-select">เลือกร้าน</label>
          <select
            id="shop-select"
            value={shop.shop}
            onChange={(e) => setSelectedShop(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
          >
            {data.shopSla.map((s) => (
              <option key={s.shop} value={s.shop} className="bg-popover text-popover-foreground">{s.shop}</option>
            ))}
          </select>
        </div>
      )}

      {shop && (
        <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
          <ShopSlaTrendChart shop={shop} dates={data.dates} />
        </Suspense>
      )}

      {trend.months.length > 0 && (
        <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
          <CategoryIncidentTrendChart trend={trend} />
        </Suspense>
      )}

      {!shop && trend.months.length === 0 && (
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-muted-foreground">
          ยังไม่มีข้อมูลเพียงพอสำหรับการวิเคราะห์เชิงลึก
        </div>
      )}
    </div>
  )
}
