import { lazy, Suspense, useState } from "react"
import { useTeamDashboard } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { Skeleton } from "@/components/ui/skeleton"
import { collectIncidents, incidentsByMonthAndCategory, percentChange } from "@/lib/dashboard-selectors"
import { ArrowDown, ArrowUp, Minus } from "lucide-react"

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

  // This-month-vs-last-month — "is performance improving or declining", no new math,
  // just summed straight from each employee's byDate for the two month keys.
  const monthKey = data.todayDate.slice(0, 7)
  const [y, m] = monthKey.split("-").map(Number)
  const prevDate = new Date(y!, m! - 2, 1)
  const lastMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`
  const sumParcelsForMonth = (key: string) =>
    data.employees.reduce(
      (sum, e) => sum + Object.entries(e.byDate).filter(([date]) => date.startsWith(key)).reduce((s, [, v]) => s + (v.parcels ?? 0), 0),
      0
    )
  const thisMonthParcels = sumParcelsForMonth(monthKey)
  const lastMonthParcels = sumParcelsForMonth(lastMonthKey)
  const monthChange = percentChange(thisMonthParcels, lastMonthParcels)

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">แนวโน้มผลงานเทียบเดือนที่แล้ว</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">{thisMonthParcels.toLocaleString("th-TH")} พัสดุ</span>
          <span className="text-muted-foreground">เดือนนี้ เทียบ {lastMonthParcels.toLocaleString("th-TH")} พัสดุ เดือนที่แล้ว</span>
          {monthChange === null ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Minus className="size-3.5" /> ไม่มีข้อมูลเทียบ
            </span>
          ) : (
            <span
              className={
                Math.abs(monthChange) < 0.5
                  ? "inline-flex items-center gap-1 text-muted-foreground"
                  : monthChange > 0
                    ? "inline-flex items-center gap-1 text-emerald-glow"
                    : "inline-flex items-center gap-1 text-destructive"
              }
            >
              {Math.abs(monthChange) < 0.5 ? <Minus className="size-3.5" /> : monthChange > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
              {Math.abs(monthChange).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
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
