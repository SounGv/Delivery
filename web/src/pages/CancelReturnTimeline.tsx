import { useMemo, useState } from "react"
import { AlertTriangle, Ban, CalendarDays, CalendarRange, CheckCircle2, Clock, Hourglass, PackageCheck, PackageX, Search, Undo2, XCircle } from "lucide-react"
import { useCancelledQuery, useRefundsQuery, useRestockQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { FilterField, ReturnRowCard, StatusPill, StatusTile, chipClass, filterSelectClass, Pager, type Tone } from "@/components/returns/ReturnsUi"
import {
  KINDS,
  KIND_LABEL,
  LOST_STATUSES,
  NO_DATE,
  buildTimelineItems,
  bucketsByDay,
  bucketsByMonth,
  monthOf,
  monthsWithData,
  needsAction,
  type Bucket,
  type TimelineItem,
  type TimelineKind,
} from "@/lib/cancel-return-timeline"
import { dateFromIso, formatFullDateLabel, formatMonthLabel, isoDateOf } from "@/lib/format"
import { Tabs } from "@/components/ui/Tabs"
import { CancelledView, CancelledWarning } from "@/pages/Cancelled"
import { cn } from "@/lib/utils"

const ALL = "__all__"
const PAGE_SIZE = 30
const num = (n: number) => n.toLocaleString("th-TH")

const KIND_ICON = { cancel: Ban, return: Undo2, lost: PackageX }
const TONE_ICON: Record<Tone, React.ComponentType<{ className?: string }> | undefined> = {
  ok: CheckCircle2,
  warn: Clock,
  danger: AlertTriangle,
  info: PackageCheck,
  neutral: undefined,
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short" })

/** The "รายงาน" page: one overview over time (below) plus the two cancelled-order views that used to
 * be only on the "สินค้ายกเลิก" page — stock already deducted (T1) and not yet deducted (T2) —
 * reused as they are (CancelledView) so every status, filter, chart and export matches that page. */
export function CancelReturnTimeline() {
  const { data } = useCancelledQuery()
  const report = data?.cancelledOrders ?? null
  const rows = useMemo(() => report?.rows ?? [], [report])
  const deducted = useMemo(() => rows.filter((r) => r.stockDeducted), [rows])
  const notDeducted = useMemo(() => rows.filter((r) => !r.stockDeducted), [rows])
  const todayIso = data?.todayDate ?? ""
  const duplicatesDropped = report?.duplicatesDropped ?? 0

  return (
    <div className="space-y-4">
      {data && <CancelledWarning report={report} />}
      <Tabs
        items={[
          {
            key: "overview",
            label: "ภาพรวมตามช่วงเวลา",
            icon: CalendarRange,
            render: () => <TimelineOverview key="overview" />,
          },
          {
            key: "deducted",
            label: `ยกเลิก · ตัดสต็อกแล้ว (${num(deducted.length)})`,
            icon: Ban,
            render: () => (
              <CancelledView
                key="deducted"
                rows={deducted}
                todayIso={todayIso}
                kindLabel="ตัดสต็อกแล้ว"
                description="ออเดอร์ที่ยกเลิกหลังตัดสต็อก ต้องรับของคืนเข้าคลัง"
                duplicatesDropped={duplicatesDropped}
              />
            ),
          },
          {
            key: "not-deducted",
            label: `ยกเลิก · ยังไม่ตัดสต็อก (${num(notDeducted.length)})`,
            icon: Hourglass,
            render: () => (
              <CancelledView
                key="not-deducted"
                rows={notDeducted}
                todayIso={todayIso}
                kindLabel="ยังไม่ตัดสต็อก"
                description="ออเดอร์ที่ยกเลิกก่อนตัดสต็อก ต้องเก็บของกลับเข้าที่"
                duplicatesDropped={duplicatesDropped}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

/** "ยกเลิก / ตีกลับ ตามช่วงเวลา": cancelled orders, bounced/returned parcels and lost parcels in one
 * list, switchable between a month view and a day view, every line with its status. Read-only; it
 * only regroups what the cancelled, restock and refund parts already carry (see
 * lib/cancel-return-timeline.ts for how the three sources are merged). */
function TimelineOverview() {
  const cancelledQ = useCancelledQuery()
  const restockQ = useRestockQuery()
  const refundsQ = useRefundsQuery()

  const items = useMemo(
    () =>
      buildTimelineItems(
        cancelledQ.data?.cancelledOrders?.rows ?? [],
        restockQ.data?.restock?.rows ?? [],
        refundsQ.data?.refunds?.rows ?? []
      ),
    [cancelledQ.data, restockQ.data, refundsQ.data]
  )
  const [mode, setMode] = useState<"month" | "day">("month")
  const [month, setMonth] = useState("") // "" = every month; NO_DATE = lines without a date
  const [day, setDay] = useState("")
  const [from, setFrom] = useState("") // yyyy-MM-dd range from the date pickers, "" = open end
  const [to, setTo] = useState("")
  const [kind, setKind] = useState<TimelineKind | typeof ALL>(ALL)
  const [statusLabel, setStatusLabel] = useState(ALL)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const todayIso = cancelledQ.data?.todayDate ?? restockQ.data?.todayDate ?? ""
  const hasRange = Boolean(from || to)

  // The date range narrows everything below it (tables, tiles, list). Lines with no date can never
  // be inside a range, so they drop out while one is set.
  const baseItems = useMemo(
    () =>
      hasRange
        ? items.filter((it) => it.date && (!from || it.date >= from) && (!to || it.date <= to))
        : items,
    [items, hasRange, from, to]
  )
  const months = useMemo(() => monthsWithData(baseItems), [baseItems])
  const activeMonth = mode === "day" ? (month && month !== NO_DATE && months.includes(month) ? month : (months[0] ?? "")) : month

  const scoped = useMemo(
    () =>
      baseItems.filter((it) => {
        if (activeMonth === NO_DATE) return !it.date
        if (activeMonth && !(it.date && monthOf(it.date) === activeMonth)) return false
        if (day && it.date !== day) return false
        return true
      }),
    [baseItems, activeMonth, day]
  )

  const kindCounts = useMemo(() => {
    const c: Record<TimelineKind, number> = { cancel: 0, return: 0, lost: 0 }
    for (const it of scoped) c[it.kind] += 1
    return c
  }, [scoped])
  const openCount = useMemo(() => scoped.filter(needsAction).length, [scoped])
  const lostCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of scoped) if (it.kind === "lost") m.set(it.status.label, (m.get(it.status.label) ?? 0) + 1)
    return m
  }, [scoped])

  const inKind = useMemo(() => scoped.filter((it) => kind === ALL || it.kind === kind), [scoped, kind])
  const statusChips = useMemo(() => {
    const m = new Map<string, { label: string; tone: Tone; count: number }>()
    for (const it of inKind) {
      const cur = m.get(it.status.label) ?? { label: it.status.label, tone: it.status.tone, count: 0 }
      cur.count += 1
      m.set(it.status.label, cur)
    }
    return [...m.values()].sort((a, b) => b.count - a.count)
  }, [inKind])

  const listItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inKind
      .filter((it) => statusLabel === ALL || it.status.label === statusLabel)
      .filter((it) => !onlyOpen || needsAction(it))
      .filter((it) => !q || [it.sku, it.orderNo, it.packageNo, it.channel].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
  }, [inKind, statusLabel, onlyOpen, search])

  const buckets = useMemo<Bucket[]>(
    () => (mode === "month" ? bucketsByMonth(baseItems) : activeMonth ? bucketsByDay(baseItems, activeMonth, todayIso) : []),
    [baseItems, mode, activeMonth, todayIso]
  )
  const maxTotal = Math.max(1, ...buckets.map((b) => b.total))

  const totalPages = Math.max(1, Math.ceil(listItems.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = listItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const isLoading = cancelledQ.isLoading || restockQ.isLoading || refundsQ.isLoading
  const failed = cancelledQ.error ?? restockQ.error ?? refundsQ.error
  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (failed) return <ErrorPanel message={failed instanceof Error ? failed.message : "Unknown error"} />

  const resetPaging = () => setPage(1)
  const pickMode = (next: "month" | "day") => {
    setMode(next)
    setDay("")
    if (next === "day" && (!month || month === NO_DATE)) setMonth(months[0] ?? "")
    resetPaging()
  }
  const pickBucket = (b: Bucket) => {
    if (mode === "month") {
      if (b.key === NO_DATE) {
        setMonth(month === NO_DATE ? "" : NO_DATE)
      } else {
        setMonth(b.key)
        setMode("day")
        setDay("")
      }
    } else {
      setDay(day === b.key ? "" : b.key)
    }
    resetPaging()
  }

  const rangeLabel = hasRange
    ? from && to && from === to
      ? formatFullDateLabel(from)
      : `${from ? formatFullDateLabel(from) : "เริ่มต้น"} – ${to ? formatFullDateLabel(to) : "ล่าสุด"}`
    : ""
  const scopeLabel = day
    ? formatFullDateLabel(day)
    : activeMonth === NO_DATE
      ? "ไม่ระบุวันที่"
      : activeMonth
        ? formatMonthLabel(activeMonth) + (rangeLabel ? ` (ช่วง ${rangeLabel})` : "")
        : rangeLabel || "ทุกเดือน"

  const setRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom)
    setTo(nextTo)
    setDay("")
    if (month === NO_DATE) setMonth("")
    resetPaging()
  }
  const presetRange = (kindOfPreset: "7" | "30" | "month") => {
    if (!todayIso) return
    const end = dateFromIso(todayIso)
    const start = new Date(end)
    if (kindOfPreset === "month") start.setDate(1)
    else start.setDate(start.getDate() - (Number(kindOfPreset) - 1))
    setRange(isoDateOf(start), todayIso)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-foreground">รายงานยกเลิก / ตีกลับ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          สินค้ายกเลิก สินค้าตีกลับ และพัสดุสูญหาย รวมในหน้าเดียว เลือกช่วงวันที่ หรือดูเป็นรายเดือน/รายวัน กดแถวในตารางเพื่อกรอง แต่ละรายการมีสถานะกำกับ
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="มุมมอง" className="inline-flex rounded-full border border-border p-1">
          {(["month", "day"] as const).map((m) => (
            <button key={m} type="button" onClick={() => pickMode(m)} aria-pressed={mode === m} className={chipClass(mode === m)}>
              {m === "month" ? "รายเดือน" : "รายวัน"}
            </button>
          ))}
        </div>
        {mode === "day" && (
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarDays className="size-4 text-muted-foreground" />
            <select
              value={activeMonth}
              onChange={(e) => {
                setMonth(e.target.value)
                setDay("")
                resetPaging()
              }}
              className={filterSelectClass}
              aria-label="เลือกเดือน"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-sm text-muted-foreground">
          กำลังดู: <span className="font-bold text-foreground">{scopeLabel}</span>
          {(day || activeMonth) && mode === "month" && (
            <button
              type="button"
              onClick={() => {
                setMonth("")
                setDay("")
                resetPaging()
              }}
              className="ml-2 font-semibold text-primary underline-offset-2 hover:underline"
            >
              ล้าง
            </button>
          )}
        </p>
      </div>

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <FilterField label="ตั้งแต่วันที่ (วัน/เดือน/ปี)">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setRange(e.target.value, to)}
            className={filterSelectClass}
            aria-label="ตั้งแต่วันที่"
          />
        </FilterField>
        <FilterField label="ถึงวันที่ (วัน/เดือน/ปี)">
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setRange(from, e.target.value)}
            className={filterSelectClass}
            aria-label="ถึงวันที่"
          />
        </FilterField>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="ช่วงวันที่ที่ใช้บ่อย">
          <button type="button" className={chipClass(false)} onClick={() => presetRange("7")}>
            7 วันล่าสุด
          </button>
          <button type="button" className={chipClass(false)} onClick={() => presetRange("30")}>
            30 วันล่าสุด
          </button>
          <button type="button" className={chipClass(false)} onClick={() => presetRange("month")}>
            เดือนนี้
          </button>
          {hasRange && (
            <button
              type="button"
              onClick={() => setRange("", "")}
              className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              ล้างช่วงวันที่
            </button>
          )}
        </div>
        {hasRange && <p className="w-full text-xs text-muted-foreground">ตอนเลือกช่วงวันที่ รายการที่ไม่ระบุวันที่จะไม่ถูกนับ</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KINDS.map((k) => (
          <StatusTile
            key={k}
            tone="neutral"
            icon={KIND_ICON[k]}
            label={KIND_LABEL[k]}
            count={kindCounts[k]}
            unit="รายการ"
            active={kind === k}
            onClick={() => {
              setKind(kind === k ? ALL : k)
              setStatusLabel(ALL)
              resetPaging()
            }}
          />
        ))}
        <StatusTile
          tone="warn"
          icon={Clock}
          label="ค้างต้องตาม"
          count={openCount}
          unit="รายการ"
          sub="รอใครสักคน หรือมีปัญหา"
          active={onlyOpen}
          onClick={() => {
            setOnlyOpen(!onlyOpen)
            resetPaging()
          }}
        />
      </div>

      <section aria-label="พัสดุสูญหาย ตามถึงไหนแล้ว" className="space-y-2">
        <h3 className="px-1 text-sm font-bold text-foreground">
          พัสดุสูญหาย: ตามถึงไหนแล้ว <span className="font-normal text-muted-foreground">· ใน {scopeLabel}</span>
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LOST_STATUSES.map((s) => {
            const active = kind === "lost" && statusLabel === s.label
            return (
              <StatusTile
                key={s.label}
                tone={s.tone}
                icon={TONE_ICON[s.tone] ?? Clock}
                label={s.label}
                count={lostCounts.get(s.label) ?? 0}
                unit="รายการ"
                active={active}
                onClick={() => {
                  setKind(active ? ALL : "lost")
                  setStatusLabel(active ? ALL : s.label)
                  resetPaging()
                }}
              />
            )
          })}
        </div>
      </section>

      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">{mode === "month" ? "สรุปรายเดือน" : "สรุปรายวัน"}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  {mode === "month" ? "เดือน" : "วันที่"}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">ยกเลิก</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">ตีกลับ</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">สูญหาย</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">รวม</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">ค้างต้องตาม</th>
                <th scope="col" className="w-32 px-4 py-2.5" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => {
                const selected = mode === "day" ? day === b.key : month === b.key
                const label =
                  b.key === NO_DATE
                    ? "ไม่ระบุวันที่"
                    : mode === "month"
                      ? formatMonthLabel(b.key)
                      : `${weekday(b.key)} ${formatFullDateLabel(b.key)}`
                return (
                  <tr
                    key={b.key}
                    onClick={() => pickBucket(b)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/60",
                      selected && "bg-primary/10",
                      b.total === 0 && "text-muted-foreground"
                    )}
                  >
                    <th scope="row" className="px-4 py-2 text-left font-semibold">
                      <button type="button" aria-pressed={selected} className="text-left font-semibold text-foreground">
                        {label}
                      </button>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{b.cancel ? num(b.cancel) : "–"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.ret ? num(b.ret) : "–"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.lost ? num(b.lost) : "–"}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{b.total ? num(b.total) : "–"}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", b.open > 0 && "font-bold text-amber-700 dark:text-amber-300")}>
                      {b.open ? num(b.open) : "–"}
                    </td>
                    <td className="px-4 py-2" aria-hidden>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary/70" style={{ width: `${(b.total / maxTotal) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {buckets.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    ยังไม่มีข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetPaging()
              }}
              placeholder="ค้นหา SKU / เลขออเดอร์ / เลขพัสดุ / ช่องทาง"
              aria-label="ค้นหา SKU, เลขออเดอร์, เลขพัสดุ หรือช่องทาง"
              className={cn(
                "w-full rounded-full border-2 bg-background py-2.5 pl-9 pr-4 text-sm font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary",
                search ? "border-primary" : "border-border"
              )}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามสถานะ">
          <button
            type="button"
            className={chipClass(statusLabel === ALL)}
            onClick={() => {
              setStatusLabel(ALL)
              resetPaging()
            }}
          >
            ทุกสถานะ ({num(inKind.length)})
          </button>
          {statusChips.map((s) => (
            <button
              key={s.label}
              type="button"
              className={chipClass(statusLabel === s.label)}
              aria-pressed={statusLabel === s.label}
              onClick={() => {
                setStatusLabel(statusLabel === s.label ? ALL : s.label)
                resetPaging()
              }}
            >
              {s.label} ({num(s.count)})
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        แสดง {num(listItems.length)} รายการ ของ {scopeLabel}
      </p>
      <div className="space-y-2.5">
        {pageItems.map((it) => (
          <TimelineRow key={it.id} item={it} />
        ))}
        {pageItems.length === 0 && (
          <div className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground">ไม่พบรายการตามตัวกรองนี้</div>
        )}
      </div>
      <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
    </div>
  )
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const StatusIcon = TONE_ICON[item.status.tone]
  const KindIcon = KIND_ICON[item.kind]
  return (
    <ReturnRowCard
      tone={item.status.tone}
      status={
        <>
          <StatusPill tone={item.status.tone} icon={StatusIcon ?? XCircle}>
            {item.status.label}
          </StatusPill>
          {item.tag && <p className="w-full text-[11px] text-muted-foreground">{item.tag}</p>}
        </>
      }
      item={
        <>
          <p className="text-sm font-semibold text-foreground">{item.sku || "-"}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            จำนวน {num(item.qty)} ชิ้น
            <StatusPill tone="neutral" icon={KindIcon} small>
              {KIND_LABEL[item.kind]}
            </StatusPill>
          </p>
        </>
      }
      refs={
        <>
          <p className="break-all">ออเดอร์ {item.orderNo || "-"}</p>
          <p className="mt-0.5 break-all">พัสดุ {item.packageNo || "-"}</p>
          <p className="mt-0.5 text-muted-foreground">{item.channel || "-"}</p>
        </>
      }
      dates={
        item.date ? (
          <>
            <p className="font-semibold text-foreground">{formatFullDateLabel(item.date)}</p>
            {item.dateNote && <p className="text-muted-foreground">{item.dateNote}</p>}
          </>
        ) : (
          <p className="text-muted-foreground">ไม่ระบุวันที่</p>
        )
      }
      money={<p className="text-muted-foreground">{item.extra || "-"}</p>}
    />
  )
}
