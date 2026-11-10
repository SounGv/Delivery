import { useState } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shared look for the returns page ("สินค้าตีกลับ"). One status colour contract, used by every
 * tab so the same colour always means the same thing:
 *   ok      green  = done / money is back
 *   warn    amber  = waiting on someone (not stocked in yet, money not back yet)
 *   danger  red    = a problem (goods never stocked in, parcel lost)
 *   info    blue   = partly done (partly stocked in)
 *   neutral gray   = no information / just a label
 * Status is never colour alone: every pill carries an icon and the word.
 */
export type Tone = "ok" | "warn" | "danger" | "info" | "neutral"

const TONE: Record<Tone, { pill: string; stripe: string; icon: string; active: string }> = {
  ok: {
    pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    stripe: "bg-emerald-500",
    icon: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    active: "ring-emerald-500",
  },
  warn: {
    pill: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
    stripe: "bg-amber-500",
    icon: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
    active: "ring-amber-500",
  },
  danger: {
    pill: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    stripe: "bg-rose-500",
    icon: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    active: "ring-rose-500",
  },
  info: {
    pill: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    stripe: "bg-sky-500",
    icon: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    active: "ring-sky-500",
  },
  neutral: {
    pill: "bg-muted text-muted-foreground",
    stripe: "bg-border",
    icon: "bg-muted text-muted-foreground",
    active: "ring-primary",
  },
}

type IconType = React.ComponentType<{ className?: string }>

export function StatusPill({ tone, icon: Icon, children, small }: { tone: Tone; icon?: IconType; children: React.ReactNode; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE[tone].pill
      )}
    >
      {Icon && <Icon className={small ? "size-3" : "size-3.5"} />}
      {children}
    </span>
  )
}

/** A big, clickable status tile: the headline count of one status, and the filter for it. */
export function StatusTile({
  tone,
  icon: Icon,
  label,
  count,
  unit,
  sub,
  active,
  onClick,
}: {
  tone: Tone
  icon: IconType
  label: string
  /** null = the number could not be read; shown as "—" instead of a misleading 0. */
  count: number | null
  unit: string
  sub?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "glass-panel relative overflow-hidden rounded-2xl p-4 pl-5 text-left transition-all hover:-translate-y-0.5",
        active && cn("ring-2", TONE[tone].active)
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", TONE[tone].stripe)} aria-hidden />
      <div className="flex items-center gap-2">
        <span className={cn("flex size-8 items-center justify-center rounded-full", TONE[tone].icon)}>
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-bold text-foreground">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-foreground">
        {count === null ? "—" : count.toLocaleString("th-TH")} <span className="text-sm font-semibold text-muted-foreground">{unit}</span>
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </button>
  )
}

/** A summary figure that is not a filter: same look as StatusTile, but not clickable. */
export function StatTile({
  tone = "neutral",
  icon: Icon,
  label,
  value,
  sub,
}: {
  tone?: Tone
  icon: IconType
  label: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div className="glass-panel relative overflow-hidden rounded-2xl p-4 pl-5">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", TONE[tone].stripe)} aria-hidden />
      <div className="flex items-center gap-2">
        <span className={cn("flex size-8 items-center justify-center rounded-full", TONE[tone].icon)}>
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-bold text-foreground">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

/** One list row as a card: colour stripe on the left, then status / item / references / dates / money. */
export function ReturnRowCard({
  tone,
  status,
  item,
  refs,
  dates,
  money,
}: {
  tone: Tone
  status: React.ReactNode
  item: React.ReactNode
  refs: React.ReactNode
  dates: React.ReactNode
  money: React.ReactNode
}) {
  return (
    <div className="glass-panel relative overflow-hidden rounded-2xl p-4 pl-5">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", TONE[tone].stripe)} aria-hidden />
      <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1.5fr)_minmax(0,1.2fr)_150px_150px] lg:items-start lg:gap-4">
        <div className="flex flex-wrap content-start gap-1.5">{status}</div>
        <div className="min-w-0">{item}</div>
        <div className="min-w-0 text-xs">{refs}</div>
        <div className="text-xs">{dates}</div>
        <div className="text-xs lg:text-right">{money}</div>
      </div>
    </div>
  )
}

/** Search + main chips on one line, the rest of the filters folded behind one button. */
export function ListToolbar({
  search,
  onSearch,
  placeholder,
  chips,
  moreFilters,
  activeCount,
  onClear,
  actions,
}: {
  search: string
  onSearch: (value: string) => void
  placeholder: string
  chips: React.ReactNode
  moreFilters: React.ReactNode
  activeCount: number
  onClear: () => void
  actions: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass-panel space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className={cn(
              "w-full rounded-full border-2 bg-background py-2.5 pl-9 pr-4 text-sm font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary",
              search ? "border-primary" : "border-border"
            )}
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">{chips}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted max-sm:min-h-10"
        >
          <SlidersHorizontal className="size-4" />
          ตัวกรองเพิ่มเติม
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
          >
            <X className="size-3.5" />
            ล้างตัวกรอง ({activeCount})
          </button>
        )}
        <div className="ml-auto">{actions}</div>
      </div>
      {open && <div className="flex flex-wrap items-end gap-3 border-t border-dashed border-border pt-3">{moreFilters}</div>}
    </div>
  )
}

export const filterSelectClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-10"

export function chipClass(active: boolean) {
  return cn(
    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all max-sm:inline-flex max-sm:min-h-10 max-sm:items-center",
    active
      ? "bg-primary text-primary-foreground -translate-y-px shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
      : "border border-border bg-card text-muted-foreground shadow-[0_2px_6px_-3px_rgba(43,168,162,0.5)] hover:-translate-y-px hover:bg-muted hover:text-foreground"
  )
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

export function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  const btn =
    "rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 max-sm:min-h-10"
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ก่อนหน้า
      </button>
      <span className="text-sm text-muted-foreground">
        หน้า {page.toLocaleString("th-TH")} จาก {totalPages.toLocaleString("th-TH")}
      </span>
      <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ถัดไป
      </button>
    </div>
  )
}
