import { ArrowRight, Clock } from "lucide-react"
import { ClampText } from "@/components/common/ClampText"
import { StatusPill, chipClass } from "@/components/returns/ReturnsUi"
import { formatFullDateLabel } from "@/lib/format"
import type { ActionItem, CountAndMoney, DayCount, ExceptionCounts, RankRow, Segment } from "@/lib/return-report"
import { cn } from "@/lib/utils"

const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`

/** One heading + one line of what the block shows, the same on every block of the page. */
export function BlockHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div>
      <h3 className="page-heading text-xl font-extrabold text-foreground">{title}</h3>
      {caption && <ClampText className="text-sm text-muted-foreground">{caption}</ClampText>}
    </div>
  )
}

/** "ต้องตามวันนี้": the lines to chase first, each with what to do and how long it has waited. */
export function ActionList({ list, total, onSeeAll }: { list: ActionItem[]; total: number; onSeeAll: () => void }) {
  if (total === 0) {
    return <div className="glass-panel rounded-2xl p-5 text-center text-sm text-muted-foreground">ไม่มีเรื่องที่ต้องตามในตอนนี้</div>
  }
  return (
    <div className="space-y-2">
      {list.map((a) => {
        const urgent = a.rank <= 1
        return (
          <div
            key={a.item.id}
            className={cn("glass-panel rounded-2xl border-l-[6px] p-3", urgent ? "border-l-rose-500" : "border-l-amber-500")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-all text-sm font-bold tabular-nums text-foreground">{a.item.packageNo || a.item.orderNo || "-"}</p>
              <StatusPill tone={urgent ? "danger" : "warn"} icon={Clock} small>
                {a.ageDays !== null ? `รอมา ${num(a.ageDays)} วัน` : "ไม่มีวันที่"}
              </StatusPill>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[a.item.channel, a.item.store, a.item.tag, a.item.amount ? baht(a.item.amount) : ""].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-sm text-foreground">
              <b>ต้องทำ:</b> {a.todo}
            </p>
          </div>
        )
      })}
      <button
        type="button"
        onClick={onSeeAll}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-bold text-primary hover:bg-muted"
      >
        ดูทั้งหมด {num(total)} เรื่อง <ArrowRight className="size-4" />
      </button>
    </div>
  )
}

const ORIGIN_COLOURS = ["#2ba8a2", "#f5c542", "#9fb5b3"]

/** "รับคืนรายวัน": one bar per day, split by origin. A day with no data yet is drawn hatched and labelled, never as 0. */
export function DailyBars({ days, origins }: { days: DayCount[]; origins: string[] }) {
  const max = Math.max(1, ...days.map((d) => d.total))
  const summary = days.map((d) => `${formatFullDateLabel(d.date)}: ${d.noData ? "ยังไม่มีข้อมูล" : `${d.total} รายการ`}`).join(", ")
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex h-32 items-end gap-1" role="img" aria-label={`รับของคืนเข้าคลังรายวัน ${summary}`}>
        {days.map((d) => (
          <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${formatFullDateLabel(d.date)} · ${d.noData ? "ยังไม่มีข้อมูล" : `${d.total} รายการ`}`}>
            {!d.noData && d.total > 0 && <span className="mb-0.5 text-center text-[10px] font-bold tabular-nums text-foreground">{d.total}</span>}
            {d.noData ? (
              <span className="h-full rounded-t bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--border)_3px,var(--border)_5px)]" />
            ) : (
              origins.map((o, i) => {
                const n = d.byOrigin[o] ?? 0
                return n > 0 ? <span key={o} className="block w-full first:rounded-t" style={{ height: `${(n / max) * 100}%`, background: ORIGIN_COLOURS[i % ORIGIN_COLOURS.length] }} /> : null
              })
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {days.map((d) => (
          <span key={d.date} className="min-w-0 flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {Number(d.date.slice(8))}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {origins.map((o, i) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm" style={{ background: ORIGIN_COLOURS[i % ORIGIN_COLOURS.length] }} />
            {o}
          </span>
        ))}
        {days.some((d) => d.noData) && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm border border-border" />
            ลายเส้น = ยังไม่มีข้อมูลของวันนั้น
          </span>
        )}
      </div>
    </div>
  )
}

/** "เกิดที่ร้านไหน ขนส่งไหนมากสุด": top names with count and share; the tail is one dashed footer row. */
export function RankList({
  rows,
  rest,
  unit,
  emptyText,
}: {
  rows: RankRow[]
  rest: { names: number; count: number; share: number }
  unit: string
  emptyText: string
}) {
  if (rows.length === 0) return <div className="glass-panel rounded-2xl p-5 text-center text-sm text-muted-foreground">{emptyText}</div>
  const max = Math.max(1, rows[0]?.count ?? 1)
  return (
    <div className="glass-panel rounded-2xl p-4">
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.name} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                i < 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0 break-words text-sm font-semibold text-foreground">{r.name}</span>
            <span className="text-right text-sm font-bold tabular-nums text-foreground">
              {num(r.count)} <span className="text-xs font-medium text-muted-foreground">· {r.share}%</span>
            </span>
            <span className="col-span-2 col-start-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className={cn("block h-full rounded-full", i < 3 ? "bg-primary" : "bg-muted-foreground/40")} style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {rest.names > 0 && (
        <p className="mt-3 flex justify-between border-t border-dashed border-border pt-2 text-sm text-muted-foreground">
          <span>
            อีก {num(rest.names)} {unit}
          </span>
          <span className="tabular-nums">
            {num(rest.count)} · {rest.share}%
          </span>
        </p>
      )}
    </div>
  )
}

/** Switch between two groupings (shop / carrier). */
export function RankSwitch<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="จัดอันดับตาม">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} className={chipClass(value === o.key)} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface ExceptionRow {
  seg: Segment
  title: string
  tone: "warn" | "danger" | "info"
  hint: string
  t: CountAndMoney
}

/** "ข้อมูลที่ต้องตรวจ": lines where the two sides disagree or something is missing; each row opens its lines in the list. */
export function ExceptionRows({ ex, onOpen }: { ex: ExceptionCounts; onOpen: (seg: Segment) => void }) {
  const rows: ExceptionRow[] = [
    { seg: "unnoted", title: "เงินเข้าแล้ว ทีมยังไม่ลงบันทึก", tone: "warn", hint: "ลงข้อความ “ได้รับเงินคืนแล้ว / ยอดเงิน” ใน BigSeller", t: ex.unnoted },
    { seg: "arrivedNotStockedIn", title: "ถึงคลังแล้วแต่ไม่ Stock-In", tone: "danger", hint: "ของอยู่ในคลังแต่ยังไม่เข้าสต็อก เสี่ยงหาย", t: ex.arrivedNotStockedIn },
    { seg: "lostUndated", title: "พัสดุสูญหายที่ไม่มีวันที่ในชีต", tone: "info", hint: "ไม่ถูกนับในช่วงเวลาใดเลย ตรวจวันที่ในชีต", t: ex.lostUndated },
  ]
  return (
    <div className="glass-panel divide-y divide-border rounded-2xl px-4">
      {rows.map((r) => (
        <button key={r.seg} type="button" onClick={() => onOpen(r.seg)} className="flex w-full items-start justify-between gap-3 py-3 text-left" disabled={r.t.count === 0}>
          <span className="min-w-0">
            <StatusPill tone={r.t.count === 0 ? "ok" : r.tone} small>
              {r.title}
            </StatusPill>
            <span className="mt-1 block text-xs text-muted-foreground">{r.t.count === 0 ? "ไม่มีรายการ" : r.hint}</span>
          </span>
          <span className="shrink-0 text-right tabular-nums">
            <span className="block text-xl font-extrabold text-foreground">{num(r.t.count)}</span>
            <span className="block text-xs text-muted-foreground">{r.t.amount ? baht(r.t.amount) : "ไม่มียอด"}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
