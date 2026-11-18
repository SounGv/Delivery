import { useEffect, useState } from "react"
import { Moon, RefreshCw, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { chipClass, filterSelectClass } from "@/components/returns/ReturnsUi"
import { TYPE_FILTERS, TYPE_LABEL, usePeopleFilter } from "@/lib/people-type"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

interface HeaderProps {
  isConnected: boolean
  isFetching: boolean
  lastUpdated: string | null
  onRefresh: () => void
}

/** The clock ticks every second, so it lives in its own component: only this text re-renders, not the whole bar. */
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{now.toLocaleTimeString("th-TH")}</>
}

export function Header({ isConnected, isFetching, lastUpdated, onRefresh }: HeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const people = usePeopleFilter()
  // The person list follows the chosen type; under "ทั้งหมด" each name carries its type when it is known.
  const options = people.names.filter((n) => people.type === "all" || people.types.get(n) === people.type)

  return (
    <header className="glass-panel topbar-surface sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-none border-x-0 border-t-0 px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold text-foreground md:text-lg">แดชบอร์ดทีมคลัง</h1>
          {/* On a phone the connection badge appears only when something is wrong; from sm up it is always shown. */}
          <span
            className={cn(
              "items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold",
              isConnected
                ? "hidden bg-emerald-glow/15 text-emerald-glow shadow-[0_0_14px_rgba(39,174,96,0.35)] ring-1 ring-emerald-glow/30 sm:inline-flex"
                : "inline-flex bg-destructive/15 text-destructive ring-1 ring-destructive/30"
            )}
          >
            <span className={cn("size-1.5 rounded-full", isConnected ? "animate-pulse bg-emerald-glow" : "bg-destructive")} />
            {isConnected ? "เชื่อมต่อแล้ว" : "ออฟไลน์"}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          <span className="max-sm:hidden">
            เชื่อมต่อชีตแล้ว · <Clock />
            {lastUpdated && " · "}
          </span>
          {lastUpdated && <>อัปเดตล่าสุด {lastUpdated}</>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="icon-sm" className="btn-raised" onClick={onRefresh} aria-label="รีเฟรชข้อมูล">
          <RefreshCw className={cn("size-4 text-primary", isFetching && "animate-spin")} />
        </Button>
        <Button variant="ghost" size="icon-sm" className="btn-raised" onClick={toggleTheme} aria-label="สลับโหมดสว่าง/มืด">
          {theme === "dark" ? <Sun className="size-4 text-primary" /> : <Moon className="size-4 text-primary" />}
        </Button>
      </div>

      <div className="flex basis-full flex-wrap items-center gap-2" role="group" aria-label="กรองพนักงาน">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="ประเภทพนักงาน">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={people.type === f.key}
              disabled={f.key !== "all" && !people.typesReady}
              title={f.key !== "all" && !people.typesReady ? "ยังแยกประเภทไม่ได้ เพราะอ่านแท็บเบิกค่าข้าวไม่ได้" : undefined}
              className={cn(chipClass(people.type === f.key), "disabled:cursor-not-allowed disabled:opacity-50")}
              onClick={() => people.setType(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={people.staff}
          onChange={(e) => people.setStaff(e.target.value)}
          className={cn(filterSelectClass, "min-w-0 max-w-[11rem] flex-1 sm:flex-none")}
          aria-label="เลือกพนักงาน"
        >
          <option value="">ทุกคน</option>
          {options.map((n) => {
            const type = people.types.get(n)
            return (
              <option key={n} value={n}>
                {people.type === "all" && type ? `${n} · ${TYPE_LABEL[type]}` : n}
              </option>
            )
          })}
        </select>
        {people.active && (
          <span className="text-xs text-muted-foreground max-sm:basis-full">
            กำลังกรองข้อมูลรายคน · ยอดขาย ยกเลิก มูลค่าสต็อกไม่ถูกกรอง
          </span>
        )}
      </div>
    </header>
  )
}
