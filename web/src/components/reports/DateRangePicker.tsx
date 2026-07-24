import { useState } from "react"
import type { DateRange } from "react-day-picker"
import { CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { dateFromIso, formatFullDateLabel, isoDateOf } from "@/lib/format"
import { getDatePresets } from "@/lib/dashboard-selectors"
import { cn } from "@/lib/utils"

interface DateRangePickerProps {
  start: string
  end: string
  minDate: string
  maxDate: string
  /** The app's notion of "today" (latest active date in the sheet) — presets like "This month" are anchored on this. */
  today: string
  onChange: (range: { start: string; end: string }) => void
}

function isComplete(range: DateRange | undefined): boolean {
  return Boolean(range?.from && range?.to)
}

export function DateRangePicker({ start, end, minDate, maxDate, today, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  // Tracks the in-progress selection while the popover is open. Reset to undefined
  // (falling back to the committed start/end) whenever the popover closes.
  const [draft, setDraft] = useState<DateRange | undefined>(undefined)
  // Each calendar panel navigates independently, so the start month and end
  // month can be jumped to directly instead of always moving as a pair.
  const [leftMonth, setLeftMonth] = useState<Date>(() => dateFromIso(start))
  const [rightMonth, setRightMonth] = useState<Date>(() => dateFromIso(end))

  const selected: DateRange = draft ?? { from: dateFromIso(start), to: dateFromIso(end) }
  const presets = getDatePresets(today, minDate)
  const isActivePreset = (p: { start: string; end: string }) => p.start === start && p.end === end

  const handleSelect = (range: DateRange | undefined, triggerDate: Date) => {
    // react-day-picker's addToRange treats a click against an already-complete
    // selection as "move the nearer endpoint" (keeping the old `from`), which
    // would silently finish and close the picker after a single click. Force
    // every click after a complete range to start a brand-new one instead,
    // anchored on the actually-clicked date (`triggerDate`), not `range.from`.
    if (isComplete(selected)) {
      setDraft({ from: triggerDate, to: undefined })
      return
    }

    if (!range?.from) return
    setDraft(range)
    if (range.to) {
      onChange({ start: isoDateOf(range.from), end: isoDateOf(range.to) })
      setOpen(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setLeftMonth(dateFromIso(start))
      setRightMonth(dateFromIso(end))
    } else {
      setDraft(undefined)
    }
  }

  const handlePreset = (p: { start: string; end: string }) => {
    onChange(p)
    setDraft(undefined)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start font-normal">
          <CalendarDays className="size-4" />
          {formatFullDateLabel(start)} - {formatFullDateLabel(end)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex shrink-0 flex-row gap-1 overflow-x-auto sm:w-36 sm:flex-col sm:overflow-visible sm:border-r sm:border-border sm:pr-3">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePreset(p)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                  isActivePreset(p) ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div>
                <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">เดือนเริ่มต้น</p>
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  captionLayout="dropdown"
                  month={leftMonth}
                  onMonthChange={setLeftMonth}
                  selected={selected}
                  onSelect={handleSelect}
                  startMonth={dateFromIso(minDate)}
                  endMonth={dateFromIso(maxDate)}
                />
              </div>
              <div>
                <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">เดือนสิ้นสุด</p>
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  captionLayout="dropdown"
                  month={rightMonth}
                  onMonthChange={setRightMonth}
                  selected={selected}
                  onSelect={handleSelect}
                  startMonth={dateFromIso(minDate)}
                  endMonth={dateFromIso(maxDate)}
                />
              </div>
            </div>
            {selected.from && !selected.to && (
              <p className="mt-1 px-1 text-[11px] text-muted-foreground">เลือกวันสิ้นสุด...</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
