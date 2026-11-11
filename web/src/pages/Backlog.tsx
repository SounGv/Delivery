import { ClampText } from "@/components/common/ClampText"
import { LIST_PAGE_SIZE } from "@/lib/page-size"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArchiveRestore,
  Banknote,
  CheckCircle2,
  Clock,
  Hourglass,
  Layers,
  ListChecks,
  MinusCircle,
  PackageCheck,
  PackageX,
  Truck,
} from "lucide-react"
import { useFocusQuery } from "@/api/queries"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { ExportButton } from "@/components/common/ExportButton"
import { DataNotice } from "@/components/common/DataNotice"
import {
  FilterField,
  ListToolbar,
  Pager,
  ReturnRowCard,
  StatTile,
  StatusPill,
  StatusTile,
  chipClass,
  filterSelectClass,
  type Tone,
} from "@/components/returns/ReturnsUi"
import { backlogReport } from "@/lib/reportExports"
import { ageBand, alertCount, distinctTexts, sortByAge, sumValueBaht, type AgeBand } from "@/lib/backlog-selectors"
import type { BacklogQueueSummary, BacklogRow } from "@/api/types"

const ALL = "__all__"
const PAGE_SIZE = LIST_PAGE_SIZE
const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number | null) => (n === null ? "-" : n.toLocaleString("th-TH", { maximumFractionDigits: 0 }))

// One icon per queue number of the sheet's six queues; any other number gets the generic one.
const QUEUE_ICONS: Record<number, React.ComponentType<{ className?: string }>> = {
  1: PackageCheck,
  2: PackageX,
  3: ArchiveRestore,
  4: Truck,
  5: AlertTriangle,
  6: Banknote,
}

/** The sheet's age colouring mapped onto the shared status colours: red = chase first. */
const BAND_TONE: Record<AgeBand, Tone> = { none: "neutral", ok: "ok", warn: "warn", bad: "danger" }
const BAND_ICON: Record<Tone, React.ComponentType<{ className?: string }>> = {
  ok: CheckCircle2,
  warn: Clock,
  danger: AlertTriangle,
  info: Clock,
  neutral: MinusCircle,
}

/** Colour of one deadline-alert line, read from the sheet's own wording. */
function alertTone(label: string): Tone {
  if (label.includes("เลยกำหนด") || label.includes("เกิน")) return "danger"
  if (label.includes("วันนี้") || label.includes("1-2")) return "warn"
  if (label.includes("ไม่มีกำหนด")) return "neutral"
  return "info"
}

/** "งานค้าง": the team's daily to-do page from the gv-returns-sync workbook — cancelled and
 * returned parcels that still need someone. One queue at a time, named exactly as the sheet
 * names it and explained in the sheet's own words. Read-only: the sheet drops a line by itself
 * once the case is handled, so there is nothing to tick here. */
export function Backlog() {
  const { data, isLoading, isError, error } = useFocusQuery()
  const [queueKey, setQueueKey] = useState("all")
  const report = data?.focus ?? null
  const rows = useMemo(() => sortByAge(report?.rows ?? []), [report])

  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (isError || !data) return <ErrorPanel message={error instanceof Error ? error.message : "Unknown error"} />

  const queues = report?.queues ?? []
  const sheetAlerts = report?.alerts ?? []
  const totalOrders = queues.reduce((sum, q) => sum + q.orders, 0)
  const oldest = queues.reduce((max, q) => Math.max(max, q.oldestDays ?? 0), 0)
  const overdue = alertCount(sheetAlerts, "เลยกำหนด")
  const dueToday = alertCount(sheetAlerts, "ครบกำหนดวันนี้")

  const selected = queues.find((q) => `queue-${q.queueNo}` === queueKey)
  const selectedRows = selected ? rows.filter((r) => r.queueNo === selected.queueNo) : rows

  return (
    <div className="space-y-4">
      {(!report || report.error || report.missingTab) && (
        <DataNotice
          title="ยังอ่านข้อมูลงานค้างไม่ได้"
          detail={
            !report
              ? 'ยังไม่มีข้อมูลส่วนนี้ใน payload (ต้อง deploy Apps Script เวอร์ชันล่าสุด)'
              : report.error
                ? `สาเหตุ: ${report.error}`
                : `ไม่พบแท็บ: ${report.missingTab}`
          }
        />
      )}

      <div>
        <h2 className="page-heading text-xl font-extrabold text-foreground">งานค้างที่ต้องทำ</h2>
        <ClampText className="text-xs text-muted-foreground">
          งานยกเลิก/ตีกลับ/ของคืนที่ยังค้าง แยกเป็นคิวงาน · แถวจะหายเองเมื่อจัดการเสร็จ (หน้านี้ไม่มีช่องให้กรอก) · ที่มา: ชีต gv-returns-sync แท็บ "โฟกัสทีม-งานค้าง"
        </ClampText>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone="neutral" icon={Banknote} label="มูลค่าค้างรวม" value={<>{baht(report?.totalValue ?? null)} <span className="text-sm font-semibold text-muted-foreground">บาท</span></>} />
        <StatTile
          tone="info"
          icon={ListChecks}
          label="ออเดอร์ที่ค้าง"
          value={<>{num(totalOrders)} <span className="text-sm font-semibold text-muted-foreground">ออเดอร์</span></>}
          sub={`${num(report?.rows.length ?? 0)} แถว (SKU)`}
        />
        <StatTile
          tone="danger"
          icon={AlertTriangle}
          label="เลยกำหนดแล้ว"
          value={<>{num(overdue)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></>}
          sub={`ครบกำหนดวันนี้ ${num(dueToday)}`}
        />
        <StatTile
          tone="warn"
          icon={Hourglass}
          label="ค้างนานสุด"
          value={<>{num(oldest)} <span className="text-sm font-semibold text-muted-foreground">วัน</span></>}
        />
      </div>

      {sheetAlerts.length > 0 && (
        <div className="glass-panel space-y-2.5 rounded-2xl p-4">
          <p className="text-sm font-extrabold text-foreground">เตือนกำหนดดำเนินการ</p>
          <div className="flex flex-wrap items-center gap-2">
            {sheetAlerts.map((a) => {
              const tone = alertTone(a.label)
              return (
                <StatusPill key={a.label} tone={tone} icon={BAND_ICON[tone]} small={a.nested}>
                  {a.nested ? "└ " : ""}
                  {a.label} <b className="tabular-nums">{num(a.count)}</b>
                </StatusPill>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="page-heading text-lg font-extrabold text-foreground">เลือกคิวงาน</h2>
        <ClampText className="text-xs text-muted-foreground">สีบอกความเร่งด่วน ดูจากเรื่องที่ค้างนานสุดในคิว: แดง = เกิน 14 วัน · เหลือง = 4-14 วัน · เขียว = 0-3 วัน · กดการ์ดเพื่อดูรายการในคิว</ClampText>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusTile
          tone="neutral"
          icon={Layers}
          label="ทุกคิว"
          count={rows.length}
          unit="แถว"
          sub={`${num(totalOrders)} ออเดอร์ · ค้างนานสุด ${num(oldest)} วัน`}
          active={queueKey === "all"}
          onClick={() => setQueueKey("all")}
        />
        {queues.map((q) => {
          const tone = BAND_TONE[ageBand(q.oldestDays)]
          const key = `queue-${q.queueNo}`
          return (
            <StatusTile
              key={key}
              tone={tone}
              icon={QUEUE_ICONS[q.queueNo] ?? ListChecks}
              label={q.queue}
              count={rows.filter((r) => r.queueNo === q.queueNo).length}
              unit="แถว"
              sub={`${num(q.orders)} ออเดอร์ · ${q.oldestDays === null ? "ไม่มีวันที่เริ่มเรื่อง" : `ค้างนานสุด ${num(q.oldestDays)} วัน`}`}
              active={queueKey === key}
              onClick={() => setQueueKey(key)}
            />
          )
        })}
      </div>

      <BacklogView key={queueKey} rows={selectedRows} summary={selected} />
    </div>
  )
}

function BacklogView({ rows, summary }: { rows: BacklogRow[]; summary?: BacklogQueueSummary }) {
  const [channel, setChannel] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [alert, setAlert] = useState(ALL)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [channel, owner, alert, search])

  const channels = useMemo(() => distinctTexts(rows, (r) => r.channel), [rows])
  const owners = useMemo(() => distinctTexts(rows, (r) => r.owner), [rows])
  const alerts = useMemo(() => distinctTexts(rows, (r) => r.alert), [rows])
  const query = search.trim().toLowerCase()

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (channel !== ALL && r.channel !== channel) return false
        if (owner !== ALL && r.owner !== owner) return false
        if (alert !== ALL && r.alert !== alert) return false
        if (query && !`${r.orderNo} ${r.packageNo} ${r.tracking} ${r.sku}`.toLowerCase().includes(query)) return false
        return true
      }),
    [rows, channel, owner, alert, query]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const activeCount = [channel !== ALL, owner !== ALL, alert !== ALL, !!query].filter(Boolean).length
  const clear = () => {
    setChannel(ALL)
    setOwner(ALL)
    setAlert(ALL)
    setSearch("")
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-extrabold text-foreground">{summary.queue}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="neutral" small>
                ฝ่ายที่ดูแล: {summary.owner || "-"}
              </StatusPill>
              <StatusPill tone={BAND_TONE[ageBand(summary.oldestDays)]} icon={BAND_ICON[BAND_TONE[ageBand(summary.oldestDays)]]}>
                {summary.oldestDays === null ? "ไม่มีวันที่เริ่มเรื่อง" : `ค้างนานสุด ${num(summary.oldestDays)} วัน`}
              </StatusPill>
            </div>
          </div>
          {summary.meaning && <p className="mt-1.5 text-sm text-muted-foreground">{summary.meaning}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            <b className="tabular-nums text-foreground">{num(summary.orders)}</b> ออเดอร์ · <b className="tabular-nums text-foreground">{num(summary.lines)}</b> แถว ·
            มูลค่าค้าง <b className="tabular-nums text-foreground">{baht(summary.valueBaht)}</b> บาท
          </p>
        </div>
      )}

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="ค้นหา ออเดอร์ / package / แทร็คกิ้ง / SKU"
        chips={
          <>
            <button type="button" onClick={() => setChannel(ALL)} className={chipClass(channel === ALL)}>
              ทุกช่องทาง
            </button>
            {channels.map((c) => (
              <button key={c} type="button" onClick={() => setChannel(c)} className={chipClass(channel === c)}>
                {c}
              </button>
            ))}
          </>
        }
        moreFilters={
          <>
            <FilterField label="ฝ่ายที่ดูแล">
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                {owners.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="เตือน">
              <select value={alert} onChange={(e) => setAlert(e.target.value)} className={filterSelectClass}>
                <option value={ALL}>ทั้งหมด</option>
                {alerts.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </FilterField>
          </>
        }
        activeCount={activeCount}
        onClear={clear}
        actions={<ExportButton disabled={filtered.length === 0} label={`ส่งออก ${num(filtered.length)} รายการ`} build={() => backlogReport(filtered)} />}
      />

      <p className="px-1 text-xs text-muted-foreground">
        แสดง {num(pageRows.length ? pageStart + 1 : 0)}-{num(pageStart + pageRows.length)} จาก {num(filtered.length)} รายการ (ทั้งหมด {num(rows.length)}) · มูลค่าที่แสดง{" "}
        {baht(sumValueBaht(filtered))} บาท · เรียงจากค้างนานสุด · แถวของคืน/ตีกลับไม่มีวันที่เริ่มเรื่อง จึงไม่มีจำนวนวันค้าง
      </p>

      <div className="space-y-2.5">
        {pageRows.map((r, i) => (
          <BacklogCard key={`${r.packageNo}-${r.sku}-${pageStart + i}`} row={r} />
        ))}
        {filtered.length === 0 && (
          <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {rows.length > 0 ? "ไม่มีรายการตามเงื่อนไขที่เลือก — ลองกด ล้างตัวกรอง" : "ไม่มีงานค้างในคิวนี้"}
          </div>
        )}
      </div>

      <Pager page={pageSafe} totalPages={totalPages} onChange={setPage} />
    </div>
  )
}

function BacklogCard({ row: r }: { row: BacklogRow }) {
  const tone = BAND_TONE[ageBand(r.ageDays)]
  const alertToneOfRow = r.alert ? alertTone(r.alert) : "neutral"
  const hasReturnStatus = !!r.returnStatus && r.returnStatus !== "-"
  const hasTimeLeft = !!r.timeLeft && r.timeLeft !== "-"
  return (
    <ReturnRowCard
      tone={tone}
      status={
        <>
          <StatusPill tone={tone} icon={BAND_ICON[tone]}>
            {r.ageDays === null ? "ไม่มีวันที่เริ่มเรื่อง" : `ค้าง ${num(r.ageDays)} วัน`}
          </StatusPill>
          {r.alert && (
            <StatusPill tone={alertToneOfRow} icon={BAND_ICON[alertToneOfRow]} small>
              {r.alert}
            </StatusPill>
          )}
          <p className="w-full text-[11px] text-muted-foreground">{r.queue}</p>
        </>
      }
      item={
        <>
          <p className="text-sm font-semibold text-foreground">{r.sku || "-"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{num(r.qty)} ชิ้น</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{r.channel || "-"}</span>
            {r.cancelReason && r.cancelReason !== "-" && <span className="text-muted-foreground">เหตุผลยกเลิก: {r.cancelReason}</span>}
          </p>
        </>
      }
      refs={
        <dl className="space-y-0.5">
          <div className="flex gap-1.5">
            <dt className="w-14 shrink-0 text-muted-foreground">ออเดอร์</dt>
            <dd className="break-all font-medium text-foreground">{r.orderNo || "-"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="w-14 shrink-0 text-muted-foreground">พัสดุ</dt>
            <dd className="break-all text-foreground">{r.packageNo || "-"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="w-14 shrink-0 text-muted-foreground">แทร็คกิ้ง</dt>
            <dd className="break-all text-foreground">{r.tracking || "-"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="w-14 shrink-0 text-muted-foreground">สถานะ</dt>
            <dd className="text-foreground">
              {hasReturnStatus ? `${r.returnStatus} · ` : ""}
              {r.stockInStatus || "-"}
            </dd>
          </div>
        </dl>
      }
      dates={
        <dl className="space-y-0.5">
          <div>
            <dt className="inline text-muted-foreground">เริ่มเรื่อง </dt>
            <dd className="inline tabular-nums text-foreground">{r.startedOn || "-"}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">กำหนด </dt>
            <dd className="inline tabular-nums text-foreground">{r.dueDate || "-"}</dd>
          </div>
          {hasTimeLeft && <p className="font-semibold text-foreground">{r.timeLeft}</p>}
        </dl>
      }
      money={
        <>
          <p className="text-base font-extrabold tabular-nums text-foreground">฿{baht(r.valueBaht)}</p>
          <p className="mt-0.5 text-muted-foreground">{r.owner || "-"}</p>
        </>
      }
    />
  )
}
