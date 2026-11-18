import { useMemo, useState } from "react"
import { AlertTriangle, Banknote, ClipboardCheck, Moon, Utensils } from "lucide-react"
import { useDashboardQuery, useMealsQuery } from "@/api/queries"
import { ClampText } from "@/components/common/ClampText"
import { DataNotice } from "@/components/common/DataNotice"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { ExportButton } from "@/components/common/ExportButton"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { BlockHeading, DailyBars } from "@/components/reports/ReturnReportParts"
import { DateInput, FilterField, Pager, StatTile, StatusPill, chipClass } from "@/components/returns/ReturnsUi"
import { formatDateLabel, formatFullDateLabel, isoDateOf } from "@/lib/format"
import {
  CLAIM_LABEL,
  LATE_CHECKOUT_FROM,
  LATE_LABEL,
  crossCheckMeals,
  dailyMeals,
  dayLines,
  latestMealDate,
  otHours,
  summarizeMeals,
  type MealCheck,
  type MealPersonRow,
  type MealNotFound,
  type MealUnfilled,
} from "@/lib/meal-claims"
import { LIST_PAGE_SIZE } from "@/lib/page-size"
import { usePeopleFilter } from "@/lib/people-type"
import { mealClaimsReport } from "@/lib/reportExports"
import { changeVs, daysBetweenIso, rangeFor, type PeriodPreset } from "@/lib/return-report"

const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`
/** OT hours from minutes of late stay (the team's rule: 60 minutes counts as 1 hour). */
const hours = (minutes: number) => otHours(minutes).toLocaleString("th-TH", { maximumFractionDigits: 1 })

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "today", label: "วันนี้" },
  { key: "yesterday", label: "เมื่อวาน" },
  { key: "7d", label: "7 วัน" },
  { key: "month", label: "เดือนนี้" },
  { key: "custom", label: "เลือกวันที่" },
]

function deltaText(now: number, before: number, unit: string): string {
  const c = changeVs(now, before)
  if (c === null) return before === 0 && now === 0 ? "ช่วงก่อนไม่มี" : "ช่วงก่อนไม่มีให้เทียบ"
  const arrow = c > 0 ? "▲" : c < 0 ? "▼" : "•"
  return `${arrow} ${Math.abs(Math.round(c))}% เทียบช่วงก่อน (${unit})`
}

const shortDate = (iso: string) => formatDateLabel(iso)

function PersonCard({ p }: { p: MealPersonRow }) {
  return (
    <div className="glass-panel rounded-2xl p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-base font-bold text-foreground">{p.name}</p>
        {p.claimDays > 0 && (
          <div className="shrink-0 text-right tabular-nums">
            <p className="text-lg font-extrabold text-foreground">{baht(p.amount)}</p>
            <p className="text-xs text-muted-foreground">เบิก {num(p.claimDays)} วัน</p>
          </div>
        )}
      </div>
      {p.claimDays > 0 && (
        <p className="mt-1 flex flex-wrap gap-1.5">
          {p.claimDates.map((d) => (
            <span key={d} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">
              {shortDate(d)}
            </span>
          ))}
        </p>
      )}
      {p.lateDays > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <StatusPill tone="info" icon={Moon} small>
            OT {num(p.lateDays)} วัน · {hours(p.lateMinutes)} ชม.
          </StatusPill>
          {p.lateDates.map((d) => (
            <span key={d} className="tabular-nums">{shortDate(d)}</span>
          ))}
        </p>
      )}
    </div>
  )
}

function CheckCard({ c }: { c: MealCheck }) {
  const late = c.kind === "late-no-claim"
  return (
    <div className="glass-panel flex items-start justify-between gap-3 rounded-2xl border-l-[6px] border-l-amber-500 p-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">
          {c.name} <span className="font-normal text-muted-foreground">· {formatFullDateLabel(c.date)}</span>
        </p>
        <p className="mt-0.5 text-sm text-foreground">
          {late
            ? `ออกงาน ${c.checkOut} แต่ไม่ได้เบิกค่าข้าววันนี้`
            : c.checkOut
              ? `เบิกค่าข้าวแล้ว แต่ในข้อมูลผลงานทีมออกงาน ${c.checkOut} (ก่อน ${LATE_CHECKOUT_FROM})`
              : "เบิกค่าข้าวแล้ว แต่ในข้อมูลผลงานทีมไม่มีเวลาออกงานของวันนี้"}
        </p>
      </div>
      <StatusPill tone={late ? "warn" : "neutral"} small>{late ? "ลืมเบิก?" : "เช็คเวลาออก"}</StatusPill>
    </div>
  )
}

/** "อยู่ดึก · เบิกค่าข้าว": who stayed late and claimed the meal allowance each day, from the team workbook tab
 * "เบิกค่าข้าว", with a check of the claims against the check-out times of the team output sheet. Read-only. */
export function MealClaims() {
  const q = useMealsQuery()
  const dash = useDashboardQuery()

  const [preset, setPreset] = useState<PeriodPreset>("month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [page, setPage] = useState(1)

  const { keep, active: filterOn } = usePeopleFilter()
  const report = q.data?.meals
  const empty = useMemo(() => ({ dates: [], claims: [], lateStays: [], notes: [], unreadCells: [], missingTab: "", error: "" }), [])
  const full = report ?? empty
  // The person filter of the top bar decides who is counted. The newest filled day still comes from the whole tab.
  const data = useMemo(
    () => (full === empty ? empty : { ...full, claims: full.claims.filter((p) => keep(p.name)), lateStays: full.lateStays.filter((p) => keep(p.name)) }),
    [full, empty, keep]
  )
  const employees = useMemo(() => dash.data?.employees ?? [], [dash.data])
  // The check against check-out times needs the team output data; without it every claim would look unmatched.
  const outReady = !!dash.data

  const today = isoDateOf(new Date())
  const asOf = useMemo(() => latestMealDate(full), [full])
  const range = useMemo(() => rangeFor(preset, today, asOf, { from: customFrom, to: customTo }), [preset, today, asOf, customFrom, customTo])
  const { summary: s, people } = useMemo(() => summarizeMeals(data, range), [data, range])
  const dailyEnd = range.to < today ? range.to : today
  const days = useMemo(() => dailyMeals(data, dailyEnd, 14, asOf), [data, dailyEnd, asOf])
  const lines = useMemo(() => dayLines(data, range), [data, range])
  const { checks, unfilled, notFound } = useMemo(() => {
    if (!outReady) return { checks: [] as MealCheck[], unfilled: [] as MealUnfilled[], notFound: [] as MealNotFound[] }
    return crossCheckMeals(data, employees, range, asOf)
  }, [data, employees, range, asOf, outReady])

  if (q.isLoading) return <LoadingSkeletonGrid count={5} />
  const message = q.error instanceof Error ? q.error.message : ""
  if (q.error) {
    // An Apps Script release from before this page answers "Unknown path: meals".
    if (/unknown path/i.test(message)) {
      return (
        <DataNotice
          title="ยังไม่มีข้อมูลเบิกค่าข้าว เพราะ Apps Script ที่ใช้อยู่เป็นรุ่นเก่า"
          body="แจ้งผู้ดูแลระบบให้ปล่อย Apps Script รุ่นใหม่ที่อ่านแท็บ “เบิกค่าข้าว” แล้วรีเฟรชหน้านี้"
          detail={message}
        />
      )
    }
    return <ErrorPanel message={message || "โหลดข้อมูลไม่สำเร็จ"} />
  }

  const missing = !report || report.error || report.missingTab
  const behind = asOf ? daysBetweenIso(asOf, today) : null
  const rangeLabel = range.from === range.to ? formatFullDateLabel(range.from) : `${formatFullDateLabel(range.from)} – ${formatFullDateLabel(range.to)}`
  const totalPages = Math.max(1, Math.ceil(lines.length / LIST_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageLines = lines.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-heading text-xl font-extrabold text-foreground">อยู่ดึก · เบิกค่าข้าว</h2>
        <ClampText className="mt-1 text-sm text-muted-foreground">
          คนที่อยู่ทำงานต่อหลังเวลาเลิกงาน เช่น รอส่งของ และเบิกค่าข้าวในแต่ละวัน ดูยอดเบิก ใครเบิกกี่วัน และเทียบกับเวลาออกงานจริงว่าตรงกันไหม
        </ClampText>
      </div>

      {missing && (
        <DataNotice
          title="อ่านแท็บเบิกค่าข้าวไม่ได้ ตัวเลขด้านล่างจึงอาจว่างหรือน้อยกว่าความจริง"
          detail={[report?.error, report?.missingTab && `ไม่พบแท็บ ${report.missingTab}`].filter(Boolean).join(" · ") || undefined}
        />
      )}
      {report && report.unreadCells.length > 0 && (
        <DataNotice
          title={`มี ${num(report.unreadCells.length)} ช่องในแท็บที่อ่านไม่ได้ จึงไม่ถูกนับ`}
          body={report.unreadCells
            .slice(0, 5)
            .map((c) => `${c.name} ${formatFullDateLabel(c.date)}: “${c.text}”`)
            .join(" · ")}
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
        {filterOn && <p className="text-xs text-muted-foreground">กำลังกรองตามตัวกรองพนักงานที่แถบด้านบน (ประเภท / รายคน)</p>}
      </div>

      {asOf && behind !== null && behind > 1 && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p className="text-foreground">
            <b>แท็บกรอกถึงวันที่ {formatFullDateLabel(asOf)}</b> (ช้ากว่าวันนี้ {num(behind)} วัน) วันที่ใหม่กว่านั้นยังว่าง ไม่ได้แปลว่าไม่มีใครเบิก
          </p>
        </div>
      )}

      <section className="space-y-3" aria-label="สรุปช่วงที่เลือก">
        <div>
          <h3 className="page-heading text-xl font-extrabold text-foreground">สรุปช่วงที่เลือก</h3>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            tone="info"
            icon={Banknote}
            label="ยอดเบิกค่าข้าว"
            value={<>{baht(s.amount)}</>}
            sub={deltaText(s.amount, s.amountBefore, baht(s.amountBefore))}
          />
          <StatTile
            tone="neutral"
            icon={Utensils}
            label="จำนวนครั้งที่เบิก"
            value={<>{num(s.claims)} <span className="text-sm font-semibold text-muted-foreground">ครั้ง</span></>}
            sub={`${num(s.claimants)} คน · 1 คน 1 วัน นับเป็น 1 ครั้ง`}
          />
          <StatTile
            tone="info"
            icon={Moon}
            label="OT พนักงานรายวัน"
            value={<>{hours(s.lateMinutes)} <span className="text-sm font-semibold text-muted-foreground">ชม.</span></>}
            sub={`${num(s.lateDays)} ครั้ง · ${num(s.latePeople)} คน · 60 นาทีนับเป็น 1 ชม.`}
          />
          <StatTile
            tone={!outReady ? "neutral" : checks.length > 0 ? "warn" : "ok"}
            icon={ClipboardCheck}
            label="ควรเช็ค"
            value={outReady ? <>{num(checks.length)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></> : <>—</>}
            sub={outReady ? "เทียบกับเวลาออกงานจริง ดูด้านล่าง" : dash.isError ? "อ่านเวลาออกงานไม่ได้ จึงยังไม่ตรวจ" : "กำลังโหลดเวลาออกงาน…"}
          />
        </div>
      </section>

      <section className="space-y-3" aria-label="ควรเช็ค">
        <BlockHeading
          title="ควรเช็ค"
          caption={`เทียบการเบิกกับเวลาออกงานในข้อมูลผลงานทีม: ออกงาน ${LATE_CHECKOUT_FROM} ขึ้นไปแต่ไม่ได้เบิก หรือเบิกแต่ไม่มีเวลาออกดึก เกณฑ์ ${LATE_CHECKOUT_FROM} ดูจากข้อมูลที่ผ่านมา (ทุกวันที่เบิกออกงานตั้งแต่เวลานี้) ยังไม่ได้ยืนยันกับทีม และไม่ได้บอกว่าใครผิด เพราะทั้งสองชีตกรอกด้วยมือ`}
        />
        {!outReady ? (
          <div className="glass-panel rounded-2xl p-5 text-center text-sm text-muted-foreground">
            {dash.isError ? "อ่านเวลาออกงานจากข้อมูลผลงานทีมไม่ได้ จึงยังไม่ตรวจ ลองรีเฟรชหน้านี้" : "กำลังโหลดเวลาออกงานจากข้อมูลผลงานทีม…"}
          </div>
        ) : checks.length === 0 ? (
          <div className="glass-panel rounded-2xl p-5 text-center text-sm text-muted-foreground">
            ไม่พบรายการที่ไม่ตรงกันในช่วงนี้ (ตรวจเฉพาะวันที่แท็บกรอกแล้ว และเฉพาะคนที่มีชื่อในกลุ่มเบิกค่าข้าว)
          </div>
        ) : (
          <div className="space-y-2">
            {checks.slice(0, 12).map((c) => (
              <CheckCard key={`${c.name}:${c.date}`} c={c} />
            ))}
            {checks.length > 12 && <p className="text-center text-xs text-muted-foreground">แสดง 12 รายการแรกจาก {num(checks.length)} รายการ ลองเลือกช่วงที่สั้นลงหรือเลือกพนักงาน</p>}
          </div>
        )}
        {outReady && unfilled.length > 0 && (
          <div className="glass-panel rounded-2xl p-3 text-sm">
            <p className="font-bold text-foreground">ช่องที่ยังว่างในแท็บ (ยังไม่นับว่าลืมเบิก)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">คนเหล่านี้ออกงาน {LATE_CHECKOUT_FROM} ขึ้นไปในวันที่แท็บยังไม่ได้กรอกช่องของเขา ถ้าทีมกรอกครบแล้วค่อยกลับมาดูใหม่</p>
            <ul className="mt-2 space-y-1">
              {unfilled.map((u) => (
                <li key={u.name} className="text-foreground">
                  <b>{u.name}</b>
                  <span className="text-muted-foreground">
                    {" "}· {u.lastFilled ? `กรอกถึง ${formatDateLabel(u.lastFilled)}` : "ยังไม่กรอกเลย"} · ออกดึก {u.days.map((d) => `${formatDateLabel(d.date)} (${d.checkOut})`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {outReady && notFound.length > 0 && (
          <div className="glass-panel rounded-2xl p-3 text-sm">
            <p className="font-bold text-foreground">ไม่พบชื่อในข้อมูลผลงานทีม (เทียบเวลาออกงานไม่ได้)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">คนเหล่านี้เบิกค่าข้าวในแท็บ แต่ไม่มีชื่อเดียวกันในชีตผลงานทีม อาจสะกดไม่ตรงกันหรือไม่ได้ลงชีตนั้น จึงไม่นับเป็นรายการควรเช็ค</p>
            <ul className="mt-2 space-y-1">
              {notFound.map((n) => (
                <li key={n.name} className="text-foreground">
                  <b>{n.name}</b>
                  <span className="text-muted-foreground"> · เบิก {n.days.map((d) => formatDateLabel(d)).join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-label="รายวัน">
        <BlockHeading title="รายวัน" caption="จำนวนคนต่อวัน 14 วันล่าสุดถึงปลายช่วงที่เลือก แยกพนักงานประจำที่เบิกค่าข้าวกับพนักงานรายวันที่ได้ OT" />
        <DailyBars days={days} origins={[CLAIM_LABEL, LATE_LABEL]} title="เบิกค่าข้าวและ OT รายวัน" colours={["#2ba8a2", "#f5c542"]} />
        <div className="space-y-2">
          {pageLines.map((l) => (
            <div key={l.date} className="glass-panel rounded-2xl p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-foreground">{formatFullDateLabel(l.date)}</p>
                <p className="text-sm font-extrabold tabular-nums text-foreground">{l.amount > 0 ? baht(l.amount) : "—"}</p>
              </div>
              {l.claimed.length > 0 && (
                <p className="mt-1 text-sm text-foreground">
                  <span className="text-xs text-muted-foreground">เบิก {num(l.claimed.length)} คน: </span>
                  {l.claimed.map((c) => c.name).join(", ")}
                </p>
              )}
              {l.late.length > 0 && (
                <p className="mt-0.5 text-sm text-foreground">
                  <span className="text-xs text-muted-foreground">OT {num(l.late.length)} คน: </span>
                  {l.late.map((c) => `${c.name} (${hours(c.minutes)} ชม.)`).join(", ")}
                </p>
              )}
            </div>
          ))}
          {lines.length === 0 && <div className="glass-panel rounded-2xl p-5 text-center text-sm text-muted-foreground">ไม่มีรายการในช่วงนี้ — ลองเลือกช่วงที่ยาวขึ้น หรือปรับตัวกรองพนักงานที่แถบด้านบน</div>}
        </div>
        <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
      </section>

      <section className="space-y-3" aria-label="รายคน">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <BlockHeading title="รายคน" caption="เรียงจากยอดเบิกมากไปน้อย รวมจากรายช่องเอง ไม่ใช้แถว “รวม” ของชีต เพราะแถวรวมของกลุ่ม OT ขึ้น #VALUE! (มีข้อความ “60 นาที” ในช่อง)" />
          <ExportButton disabled={lines.length === 0} label={`ส่งออก ${num(lines.length)} วัน`} build={() => mealClaimsReport(lines)} />
        </div>
        {people.length === 0 ? (
          <div className="glass-panel rounded-2xl p-5 text-center text-sm text-muted-foreground">ไม่มีใครเบิกหรือได้ OT ในช่วงนี้</div>
        ) : (
          <div className="space-y-2">
            {people.map((p) => (
              <PersonCard key={p.name} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
