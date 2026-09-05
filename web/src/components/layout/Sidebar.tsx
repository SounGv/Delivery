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
// ฝ่ายคลัง+รับเข้า, ยอดขาย, and งานที่ต้องเช็ค already had one dedicated
// cross-team page each, so they're unchanged, just relabeled/regrouped here.
export const NAV_GROUPS: NavGroup[] = [
  {
    section: "เมนูหลัก",
    items: [
      { key: "dashboard", label: "ภาพรวม", icon: LayoutDashboard, enabled: true },
      { key: "receiving-warehouse", label: "ฝ่ายคลัง+รับเข้า", icon: Landmark, enabled: true },
      { key: "team-online", label: "ฝ่ายออนไลน์", icon: Monitor, enabled: true },
      { key: "team-offline", label: "ฝ่ายออฟไลน์", icon: Home, enabled: true },
      { key: "sales-summary", label: "ยอดขาย", icon: BarChart3, enabled: true },
      { key: "work-issues", label: "งานที่ต้องเช็ค", icon: ClipboardCheck, enabled: true },
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
      className="glass-panel sticky top-0 z-20 hidden h-svh flex-col justify-between rounded-r-2xl border-y-0 border-l-0 py-4 md:flex"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("flex items-center gap-2 px-4 pb-6", collapsed && "justify-center px-0")}>
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="Company logo" className="size-9 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-emerald-glow shadow-lg shadow-brand-600/30">
              <Warehouse className="size-5 text-white" />
            </div>
          )}
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="truncate text-sm font-semibold text-foreground">Warehouse Pro</p>
              <p className="truncate text-xs text-muted-foreground">Dashboard</p>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.section} className="mb-2">
              {!collapsed ? (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70">
                  {group.section}
                </p>
              ) : (
                <div className="mx-3 my-2 border-t border-white/5" />
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
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                      !item.enabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground"
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" />
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
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {collapsed ? <ChevronsRight className="size-[18px]" /> : <ChevronsLeft className="size-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  )
}
