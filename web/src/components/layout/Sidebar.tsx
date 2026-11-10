import { useState } from "react"
import { motion } from "framer-motion"
import {
  LayoutDashboard,
  Landmark,
  Monitor,
  Home,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Warehouse,
  BarChart3,
  ClipboardCheck,
  PackageX,
  Ban,
  CalendarRange,
  ListChecks,
  Coins,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSettings } from "@/lib/settingsContext"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export interface NavItem {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  enabled: boolean
}

export interface NavGroup {
  section: string
  items: NavItem[]
}

// Menu organized by DEPARTMENT rather than by function — each department item
// (ฝ่ายออนไลน์/ฝ่ายออฟไลน์) is a single page gathering that crew's overview,
// people, attendance, performance, and OT under tabs (see TeamDepartmentPage.tsx),
// reusing the exact same pages/logic the old function-based menu pointed at.
// ฝ่ายคลัง and ฝ่ายรับเข้า used to share one combined "ฝ่ายคลัง+รับเข้า" page —
// split into their own entries so every department follows the same one-page-
// per-department pattern as ฝ่ายออนไลน์/ฝ่ายออฟไลน์. ยอดขาย and งานที่ต้องเช็ค
// already had one dedicated cross-team page each, so they're unchanged.
export const NAV_GROUPS: NavGroup[] = [
  {
    section: "เมนูหลัก",
    items: [
      { key: "dashboard", label: "ภาพรวม", icon: LayoutDashboard, enabled: true },
      { key: "team-warehouse", label: "ฝ่ายคลัง", icon: Warehouse, enabled: true },
      { key: "team-receiving", label: "ฝ่ายรับเข้า", icon: Landmark, enabled: true },
      { key: "team-online", label: "ฝ่ายออนไลน์", icon: Monitor, enabled: true },
      { key: "team-offline", label: "ฝ่ายออฟไลน์", icon: Home, enabled: true },
      { key: "sales-summary", label: "ยอดขาย", icon: BarChart3, enabled: true },
      { key: "work-issues", label: "งานที่ต้องเช็ค", icon: ClipboardCheck, enabled: true },
      { key: "returns", label: "สินค้าตีกลับ", icon: PackageX, enabled: true },
      { key: "cancelled", label: "สินค้ายกเลิก", icon: Ban, enabled: true },
      { key: "timeline", label: "รายงาน", icon: CalendarRange, enabled: true },
      { key: "backlog", label: "งานค้าง", icon: ListChecks, enabled: true },
      { key: "stock-value", label: "มูลค่าสต็อก", icon: Coins, enabled: true },
    ],
  },
  {
    section: "ระบบ",
    items: [{ key: "settings", label: "Settings", icon: Settings, enabled: true }],
  },
]

// Flat, de-duplicated list — consumed by MobileTabBar.
export const NAV_ITEMS: NavItem[] = (() => {
  const seen = new Set<string>()
  const flat: NavItem[] = []
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (seen.has(item.key)) continue
      seen.add(item.key)
      flat.push(item)
    }
  }
  return flat
})()

interface SidebarProps {
  active: string
  onNavigate: (key: string) => void
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { logoDataUrl } = useSettings()

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 240 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="glass-panel sidebar-surface sticky top-0 z-20 hidden h-svh flex-col justify-between rounded-r-2xl border-y-0 border-l-0 py-4 md:flex"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("flex items-center gap-2 px-4 pb-6", collapsed && "justify-center px-0")}>
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="Company logo" className="size-9 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 via-brand-500 to-emerald-glow shadow-[0_10px_22px_-8px_rgba(43,168,162,0.85)] ring-1 ring-white/30">
              <Warehouse className="size-5 text-white drop-shadow" />
            </div>
          )}
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="truncate text-sm font-semibold text-foreground">Warehouse Pro</p>
              <p className="truncate text-xs text-muted-foreground">Dashboard</p>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.section} className="mb-2 flex flex-col gap-1">
              {!collapsed ? (
                <p className="flex items-center gap-2 px-3 pt-2 pb-1 text-[11px] font-bold tracking-wide text-muted-foreground">
                  {group.section}
                  <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden />
                </p>
              ) : (
                <div className="mx-3 my-2 border-t border-border" />
              )}
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = active === item.key
                const button = (
                  <button
                    key={item.key + item.label}
                    type="button"
                    disabled={!item.enabled}
                    onClick={() => item.enabled && onNavigate(item.key)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold transition-all duration-200",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-gradient-to-r from-[#17706b] to-[#1a7f79] text-white shadow-[0_12px_24px_-10px_rgba(23,112,107,0.9),inset_0_1px_0_rgba(255,255,255,0.28)] ring-1 ring-white/15"
                        : "text-foreground/80 hover:-translate-y-px hover:bg-accent hover:text-foreground hover:shadow-[0_8px_18px_-12px_rgba(43,168,162,0.7)]",
                      !item.enabled && "cursor-not-allowed opacity-40 hover:translate-y-0 hover:bg-transparent hover:shadow-none"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                        isActive
                          ? "bg-white/20 text-white shadow-inner"
                          : "bg-muted text-primary shadow-[0_2px_5px_rgba(43,168,162,0.18),inset_0_1px_0_rgba(255,255,255,0.4)] group-hover:bg-card"
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                )
                return collapsed ? (
                  <Tooltip key={item.key + item.label}>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  button
                )
              })}
            </div>
          ))}
        </nav>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="btn-raised flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronsRight className="size-[18px]" /> : <ChevronsLeft className="size-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  )
}
