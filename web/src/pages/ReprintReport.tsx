import { useMemo, useState } from "react"
import { AlertTriangle, Copy, Hand, Printer, Users, Zap } from "lucide-react"
import { useReprintsQuery } from "@/api/queries"
import { ClampText } from "@/components/common/ClampText"
import { DataNotice } from "@/components/common/DataNotice"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { ExportButton } from "@/components/common/ExportButton"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { BlockHeading, DailyBars, RankList } from "@/components/reports/ReturnReportParts"
import { DateInput, FilterField, Pager, StatTile, StatusPill, chipClass, filterSelectClass } from "@/components/returns/ReturnsUi"
import { formatFullDateLabel, isoDateOf } from "@/lib/format"
import { LIST_PAGE_SIZE } from "@/lib/page-size"
import { reprintCasesReport } from "@/lib/reportExports"
import {
  HEAVY_LABEL,
  HEAVY_PRINTS,
  NORMAL_LABEL,
  RAPID_SECONDS,
  casesIn,
  dailyReprints,
  inReprintSegment,
  latestReprintDate,
  rankPressers,
  sortReprints,
  summarizeReprints,
  toCase,
  type ReprintCase,
  type ReprintSegment,
} from "@/lib/reprint-report"
import { changeVs, daysBetweenIso, rangeFor, type PeriodPreset } from "@/lib/return-report"
import { cn } from "@/lib/utils"

const num = (n: number) => n.toLocaleString("th-TH")

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "today", label: "วันนี้" },
  { key: "yesterday", label: "เมื่อวาน" },
  { key: "7d", label: "7 วัน" },
  { key: "month", label: "เดือนนี้" },
  { key: "custom", label: "เลือกวันที่" },
]

const SEGMENTS: { key: ReprintSegment; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "heavy", label: `พิมพ์ ${HEAVY_PRINTS} ครั้งขึ้นไป` },
  { key: "rapid", label: "พิมพ์ห่างกันไม่เกิน 1 นาที" },
  { key: "multiStaff", label: "หลายคนพิมพ์" },
]

function deltaText(now: number, before: number): string {
  const c = changeVs(now, before)
  if (c === null) return before === 0 && now === 0 ? "ช่วงก่อนไม่มี" : "ช่วงก่อนไม่มีให้เทียบ"
  const arrow = c > 0 ? "▲" : c < 0 ? "▼" : "•"
  return `${arrow} ${Math.abs(Math.round(c))}% เทียบช่วงก่อน (${num(before)})`
}

const methodPill = (m: "manual" | "auto" | "other") => (m === "auto" ? "info" : "neutral")

function ReprintCard({ c }: { c: ReprintCase }) {
  return (
    <div className={cn("glass-panel rounded-2xl border-l-[6px] p-3", c.heavy ? "border-l-rose-500" : "border-l-amber-500")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="break-all text-sm font-bold tabular-nums text-foreground">{c.packageNo || c.orderNo}</p>
        <StatusPill tone={c.heavy ? "danger" : "warn"} icon={Printer} small>
          พิมพ์ {num(c.prints)} ครั้ง
        </StatusPill>
      </div>
      <p className="mt-0.5 break-all text-xs text-muted-foreground">
        {[formatFullDateLabel(c.date), c.orderNo && `ออเดอร์ ${c.orderNo}`].filter(Boolean).join(" · ")}
      </p>
      {(c.rapid || c.multiStaff || c.countMismatch) && (
        <p className="mt-1.5 flex flex-wrap gap-1.5">
          {c.rapid && <StatusPill tone="warn" icon={Zap} small>พิมพ์ห่างกันไม่เกิน 1 นาที</StatusPill>}
          {c.multiStaff && <StatusPill tone="info" icon={Users} small>{`พิมพ์ ${c.staff.length} บัญชี`}</StatusPill>}
          {c.countMismatch && <StatusPill tone="neutral" icon={AlertTriangle} small>{`บันทึกการกด ${num(c.logLines)} บรรทัด (ชีตนับ ${num(c.prints)} ครั้ง)`}</StatusPill>}
        </p>
      )}
      {c.items && <p className="mt-1.5 text-sm text-foreground">{c.items}</p>}
      {c.events.length > 0 ? (
        <ol className="mt-2 space-y-1 border-t border-dashed border-border pt-2 text-xs">
          {c.events.map((e) => (
            <li key={e.n} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="w-12 shrink-0 text-muted-foreground">ครั้งที่ {e.n}</span>
              <span className="font-semibold tabular-nums text-foreground">{e.time}</span>
              <span className="break-all text-foreground">{e.user}</span>
              <StatusPill tone={methodPill(e.method)} small>{e.methodLabel || "—"}</StatusPill>
            </li>
          ))}
        </ol>
      ) : (
        c.details && <p className="mt-2 break-words border-t border-dashed border-border pt-2 text-xs text-muted-foreground">{c.details}</p>
      )}
    </div>
  )
}

/** "ออเดอร์พิมพ์ซ้ำ": orders whose shipping label was printed more than once, per day, from the team workbook tab
 * "รายงานออเดอร์พิมพ์ซ้ำรายวัน" — who pressed print, when, by hand or marked by the system. Read-only. */
export function ReprintReport() {
  const q = useReprintsQuery()

  const [preset, setPreset] = useState<PeriodPreset>("7d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [staff, setStaff] = useState("")
  const [segment, setSegment] = useState<ReprintSegment>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const all = useMemo(() => (q.data?.reprints?.rows ?? []).map(toCase), [q.data])
  const staffNames = useMemo(() => [...new Set(all.flatMap((c) => c.staff))].sort((a, b) => a.localeCompare(b)), [all])
  const filtered = useMemo(() => (staff ? all.filter((c) => c.staff.includes(staff)) : all), [all, staff])

  const today = isoDateOf(new Date())
  const asOf = useMemo(() => latestReprintDate(all), [all])
  const range = useMemo(() => rangeFor(preset, today, asOf, { from: customFrom, to: customTo }), [preset, today, asOf, customFrom, customTo])
  const s = useMemo(() => summarizeReprints(filtered, range), [filtered, range])
  const dailyEnd = range.to < today ? range.to : today
  const days = useMemo(() => dailyReprints(filtered, dailyEnd, 14, asOf), [filtered, dailyEnd, asOf])
  const pressers = useMemo(() => rankPressers(filtered, range), [filtered, range])
  const inPeriod = useMemo(() => casesIn(filtered, range), [filtered, range])
  const segCounts = useMemo(() => new Map(SEGMENTS.map((sg) => [sg.key, inPeriod.filter((c) => inReprintSegment(c, sg.key)).length])), [inPeriod])
  const listItems = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return sortReprints(
      inPeriod.filter(
        (c) =>
          inReprintSegment(c, segment) &&
          (!needle || [c.packageNo, c.orderNo, c.items, c.staff.join(" ")].some((v) => v.toLowerCase().includes(needle)))
      )
    )
  }, [inPeriod, segment, search])

  if (q.isLoading) return <LoadingSkeletonGrid count={5} />
  const message = q.error instanceof Error ? q.error.message : ""
  if (q.error) {
    // An Apps Script release from before this page answers "Unknown path: reprints".
    if (/unknown path/i.test(message)) {
      return (
        <DataNotice
          title="ยังไม่มีข้อมูลออเดอร์พิมพ์ซ้ำ เพราะ Apps Script ที่ใช้อยู่เป็นรุ่นเก่า"
          body="แจ้งผู้ดูแลระบบให้ปล่อย Apps Script รุ่นใหม่ที่อ่านแท็บ “รายงานออเดอร์พิมพ์ซ้ำรายวัน” แล้วรีเฟรชหน้านี้"
          detail={message}
        />
      )
    }
    return <ErrorPanel message={message || "โหลดข้อมูลไม่สำเร็จ"} />
  }

  const report = q.data?.reprints
  const missing = !report || report.error || report.missingTab
  const behind = asOf ? daysBetweenIso(asOf, today) : null
  const rangeLabel = range.from === range.to ? formatFullDateLabel(range.from) : `${formatFullDateLabel(range.from)} – ${formatFullDateLabel(range.to)}`
  const totalPages = Math.max(1, Math.ceil(listItems.length / LIST_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = listItems.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE)
  const segLabel = SEGMENTS.find((sg) => sg.key === segment)?.label ?? "รายการ"

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-heading text-xl font-extrabold text-foreground">ออเดอร์พิมพ์ซ้ำรายวัน</h2>
        <ClampText className="mt-1 text-sm text-muted-foreground">
          ออเดอร์ที่พิมพ์ใบปะหน้ามากกว่า 1 ครั้งในวันเดียวกัน ดูว่าวันไหนมีกี่ใบ ใครกดพิมพ์ และพิมพ์ห่างกันกี่วินาที เพื่อเช็คว่าเป็นการกดซ้ำหรือต้องพิมพ์ใหม่จริง
        </ClampText>
      </div>

      {missing && (
        <DataNotice
          title="อ่านแท็บออเดอร์พิมพ์ซ้ำไม่ได้ ตัวเลขด้านล่างจึงอาจว่างหรือน้อยกว่าความจริง"
          detail={[report?.error, report?.missingTab && `ไม่พบแท็บ ${report.missingTab}`].filter(Boolean).join(" · ") || undefined}
        />
      )}

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <div>
          <span className="mb-1 block text-[11px] text-muted-foreground">ช่วงเวลา</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="ช่วงเวลา">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={preset === p.key}
                className={chipClass(preset === p.key)}
                onClick={() => {
                  setPreset(p.key)
                  setPage(1)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <FilterField label="ตั้งแต่วันที่">
              <DateInput value={customFrom} max={customTo || undefined} onChange={setCustomFrom} label="ตั้งแต่วันที่" />
            </FilterField>
            <FilterField label="ถึงวันที่">
              <DateInput value={customTo} min={customFrom || undefined} onChange={setCustomTo} label="ถึงวันที่" />
            </FilterField>
          </div>
        )}
        <FilterField label="ผู้พิมพ์ (บัญชี)">
          <select
            value={staff}
            onChange={(e) => {
              setStaff(e.target.value)
              setPage(1)
            }}
            className={`${filterSelectClass} w-full`}
            aria-label="ผู้พิมพ์"
          >
            <option value="">ทุกบัญชี</option>
            {staffNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </FilterField>
      </div>

      {asOf && behind !== null && behind > 1 && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p className="text-foreground">
            <b>ข้อมูลถึงวันที่ {formatFullDateLabel(asOf)}</b> (ช้ากว่าวันนี้ {num(behind)} วัน) วันที่ใหม่กว่านั้นเป็น 0 เพราะยังไม่มีแถวในแท็บ ไม่ได้แปลว่าไม่มีการพิมพ์ซ้ำ
          </p>
        </div>
      )}

      <section className="space-y-3" aria-label="สรุปช่วงที่เลือก">
        <div>
          <h3 className="page-heading text-xl font-extrabold text-foreground">สรุปช่วงที่เลือก</h3>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile
            tone="info"
            icon={Printer}
            label="ออเดอร์พิมพ์ซ้ำ"
            value={<>{num(s.orders)} <span className="text-sm font-semibold text-muted-foreground">ออเดอร์</span></>}
            sub={deltaText(s.orders, s.ordersBefore)}
          />
          <StatTile
            tone="neutral"
            icon={Hand}
            label="ครั้งที่พิมพ์รวม"
            value={<>{num(s.prints)} <span className="text-sm font-semibold text-muted-foreground">ครั้ง</span></>}
            sub={`กดพิมพ์เอง ${num(s.manualPresses)} ครั้ง`}
          />
          <StatTile
            tone={s.heavy > 0 ? "danger" : "ok"}
            icon={Copy}
            label={`พิมพ์ ${HEAVY_PRINTS} ครั้งขึ้นไป`}
            value={<>{num(s.heavy)} <span className="text-sm font-semibold text-muted-foreground">ออเดอร์</span></>}
            sub="นับจากรายละเอียดการพิมพ์ทีละครั้ง"
          />
          <StatTile
            tone={s.rapid > 0 ? "warn" : "ok"}
            icon={Zap}
            label="พิมพ์ห่างกันไม่เกิน 1 นาที"
            value={<>{num(s.rapid)} <span className="text-sm font-semibold text-muted-foreground">ออเดอร์</span></>}
            sub={`มี 2 ครั้งติดกันห่างไม่เกิน ${RAPID_SECONDS} วินาที อาจเป็นการกดซ้ำ ควรเช็ค`}
          />
          <div className="col-span-2 lg:col-span-2">
            <StatTile
              tone={s.multiStaff > 0 ? "info" : "ok"}
              icon={Users}
              label="หลายคนพิมพ์ใบเดียวกัน"
              value={<>{num(s.multiStaff)} <span className="text-sm font-semibold text-muted-foreground">ออเดอร์</span></>}
              sub="พิมพ์จากหลายบัญชี เสี่ยงใบปะหน้าซ้ำออกไปสองใบ"
            />
          </div>
        </div>
      </section>

      {s.countMismatch > 0 && (
        <p className="text-xs text-muted-foreground">
          มี {num(s.countMismatch)} ออเดอร์ที่จำนวนบรรทัดในรายละเอียดการพิมพ์ไม่เท่ากับ “จำนวนครั้งที่พิมพ์” ของชีต หน้านี้ใช้เลขของชีตเป็นจำนวนครั้ง และแสดงบรรทัดรายละเอียดไว้ใต้การ์ดให้เทียบ ผมยังไม่ทราบสูตรของคอลัมน์นี้
        </p>
      )}

      <section className="space-y-3" aria-label="พิมพ์ซ้ำรายวัน">
        <BlockHeading title="พิมพ์ซ้ำรายวัน" caption="จำนวนออเดอร์ที่พิมพ์ซ้ำในแต่ละวัน 14 วันล่าสุดถึงปลายช่วงที่เลือก แยกตามจำนวนครั้ง" />
        <DailyBars
          days={days}
          origins={[NORMAL_LABEL, HEAVY_LABEL]}
          title="ออเดอร์พิมพ์ซ้ำรายวัน"
          colours={["#2ba8a2", "#e74c3c"]}
        />
      </section>

      <section className="space-y-3" aria-label="ใครกดพิมพ์ซ้ำ">
        <BlockHeading title="ใครกดพิมพ์ซ้ำมากสุด" caption="นับการกดตั้งแต่ครั้งที่ 2 ของแต่ละออเดอร์ แยกตามบัญชีที่กด ในช่วงที่เลือก 8 อันดับแรก" />
        <RankList rows={pressers.rows} rest={pressers.rest} unit="บัญชี" emptyText="ไม่มีการพิมพ์ซ้ำในช่วงนี้ ลองเลือกช่วงที่ยาวขึ้น" />
      </section>

      <section id="reprint-list" className="scroll-mt-20 space-y-3" aria-label="รายการออเดอร์พิมพ์ซ้ำ">
        <BlockHeading title="รายการออเดอร์พิมพ์ซ้ำ" caption="เรียงจากวันใหม่ไปเก่า ค้นหาด้วยเลขพัสดุ ออเดอร์ สินค้า หรือบัญชีที่พิมพ์" />
        <div className="glass-panel space-y-3 rounded-2xl p-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="ชุดรายการ">
            {SEGMENTS.map((sg) => (
              <button
                key={sg.key}
                type="button"
                aria-pressed={segment === sg.key}
                className={chipClass(segment === sg.key)}
                onClick={() => {
                  setSegment(sg.key)
                  setPage(1)
                }}
              >
                {sg.label} ({num(segCounts.get(sg.key) ?? 0)})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="ค้นหา เลขพัสดุ / ออเดอร์ / สินค้า / บัญชี"
              aria-label="ค้นหารายการ"
              className={`${filterSelectClass} min-w-[200px] flex-1`}
            />
            <ExportButton disabled={listItems.length === 0} label={`ส่งออก ${num(listItems.length)} รายการ`} build={() => reprintCasesReport(listItems, segLabel)} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          แสดง {num(pageItems.length)} จาก {num(listItems.length)} รายการ
        </p>
        <div className="space-y-2.5">
          {pageItems.map((c) => (
            <ReprintCard key={`${c.date}:${c.packageNo}:${c.orderNo}`} c={c} />
          ))}
          {pageItems.length === 0 && (
            <div className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground">ไม่พบรายการ — ลองเลือกชุดอื่น เปลี่ยนช่วงเวลา หรือล้างคำค้นหา</div>
          )}
        </div>
        <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
      </section>
    </div>
  )
}
