import { useMemo, useState } from "react"
import { AlertTriangle, Ban, Clock, Hourglass, PackageCheck, PackageSearch, PackageX, Banknote, FileText } from "lucide-react"
import { useCancelledQuery, useRefundsQuery, useRestockQuery } from "@/api/queries"
import { ClampText } from "@/components/common/ClampText"
import { DataNotice } from "@/components/common/DataNotice"
import { ErrorPanel } from "@/components/common/ErrorPanel"
import { LoadingSkeletonGrid } from "@/components/common/LoadingSkeletonGrid"
import { DateInput, FilterField, StatTile, StatusPill, chipClass, filterSelectClass, type Tone } from "@/components/returns/ReturnsUi"
import { buildTimelineItems, type LostStage } from "@/lib/cancel-return-timeline"
import { formatFullDateLabel, isoDateOf } from "@/lib/format"
import {
  applyFilters,
  changeVs,
  daysBetweenIso,
  latestDataDate,
  rangeFor,
  summarize,
  type CountAndMoney,
  type PeriodPreset,
} from "@/lib/return-report"

const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "today", label: "วันนี้" },
  { key: "yesterday", label: "เมื่อวาน" },
  { key: "7d", label: "7 วัน" },
  { key: "month", label: "เดือนนี้" },
  { key: "custom", label: "เลือกวันที่" },
]

/** The four places a lost parcel's money can be, in the order the work goes. Wording is the team's own
 * ("รอเงินคืนจากขนส่ง" is the BigSeller colour label). */
const STAGES: { key: LostStage; label: string; hint: string; tone: Tone; bar: string }[] = [
  { key: "none", label: "ยังไม่ได้ทำเรื่อง", hint: "ไม่มีทั้งข้อความและป้ายใน BigSeller — ต้องตามก่อน", tone: "danger", bar: "bg-rose-500" },
  { key: "claimed", label: "ทำเรื่องขอเงินคืนแล้ว · รอเงิน", hint: "ติดป้าย “รอเงินคืนจากขนส่ง” ไว้แล้ว", tone: "warn", bar: "bg-amber-500" },
  { key: "unnoted", label: "เงินเข้าแล้ว · ยังไม่ลงบันทึก", hint: "จ่ายแล้ว แต่ทีมยังไม่พิมพ์ข้อความใน BigSeller", tone: "info", bar: "bg-sky-500" },
  { key: "paid", label: "ได้เงินคืนแล้ว", hint: "ติดป้ายหรือพิมพ์ว่าได้เงินแล้ว", tone: "ok", bar: "bg-emerald-500" },
]

const sub = (t: CountAndMoney) => [t.qty ? `${num(t.qty)} ชิ้น` : "", t.amount ? baht(t.amount) : ""].filter(Boolean).join(" · ")

function deltaText(now: number, before: number): string {
  const c = changeVs(now, before)
  if (c === null) return before === 0 && now === 0 ? "ช่วงก่อนไม่มี" : "ช่วงก่อนไม่มีให้เทียบ"
  const arrow = c > 0 ? "▲" : c < 0 ? "▼" : "•"
  return `${arrow} ${Math.abs(Math.round(c))}% เทียบช่วงก่อน (${num(before)})`
}

/** "สรุปตีกลับ สูญหาย และเงินคืน": the questions the returns team asks every day — how much came back, what is
 * still waiting, how much was lost, has the refund been asked for, has it been paid — plus the two kinds of cancelled
 * orders. Read-only; all figures come from the same merged lines as the period report (lib/return-report.ts). */
export function ReturnSummary() {
  const cancelledQ = useCancelledQuery()
  const restockQ = useRestockQuery()
  const refundsQ = useRefundsQuery()

  const [preset, setPreset] = useState<PeriodPreset>("7d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [channel, setChannel] = useState("")
  const [origin, setOrigin] = useState("")

  const all = useMemo(
    () =>
      buildTimelineItems(
        cancelledQ.data?.cancelledOrders?.rows ?? [],
        restockQ.data?.restock?.rows ?? [],
        refundsQ.data?.refunds?.rows ?? []
      ),
    [cancelledQ.data, restockQ.data, refundsQ.data]
  )
  const channels = useMemo(() => [...new Set(all.map((i) => i.channel).filter(Boolean))].sort(), [all])
  const origins = useMemo(() => [...new Set(all.map((i) => i.origin).filter(Boolean))].sort(), [all])

  const today = isoDateOf(new Date())
  const asOf = useMemo(() => latestDataDate(all), [all])
  const range = useMemo(() => rangeFor(preset, today, asOf, { from: customFrom, to: customTo }), [preset, today, asOf, customFrom, customTo])
  const items = useMemo(() => applyFilters(all, { channel, origin }), [all, channel, origin])
  const s = useMemo(() => summarize(items, range, today), [items, range, today])

  const isLoading = cancelledQ.isLoading || restockQ.isLoading || refundsQ.isLoading
  const failed = cancelledQ.error ?? restockQ.error ?? refundsQ.error
  if (isLoading) return <LoadingSkeletonGrid count={5} />
  if (failed) return <ErrorPanel message={failed instanceof Error ? failed.message : "โหลดข้อมูลไม่สำเร็จ"} />

  const restock = restockQ.data?.restock
  const refunds = refundsQ.data?.refunds
  const missing = !restock || restock.error || restock.missingTab || !refunds || refunds.error || refunds.missingTab
  const behind = asOf ? daysBetweenIso(asOf, today) : null
  const rangeLabel = range.from === range.to ? formatFullDateLabel(range.from) : `${formatFullDateLabel(range.from)} – ${formatFullDateLabel(range.to)}`
  const maxStage = Math.max(1, ...STAGES.map((st) => s.money[st.key].count))

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-heading text-xl font-extrabold text-foreground">สรุปตีกลับ สูญหาย และเงินคืน</h2>
        <ClampText className="mt-1 text-sm text-muted-foreground">
          ดูว่าช่วงที่เลือกมีของคืนเข้าคลังเท่าไร ยังค้างอะไรอยู่ สูญหายเท่าไร และเงินคืนอยู่ขั้นไหน รวมสินค้ายกเลิกทั้งสองแบบ
        </ClampText>
      </div>

      {missing && (
        <DataNotice
          title="อ่านข้อมูลตีกลับหรือเงินคืนไม่ครบ ตัวเลขด้านล่างอาจน้อยกว่าความจริง"
          detail={[restock?.error, restock?.missingTab && `ไม่พบแท็บ ${restock.missingTab}`, refunds?.error, refunds?.missingTab && `ไม่พบแท็บ ${refunds.missingTab}`].filter(Boolean).join(" · ") || undefined}
        />
      )}

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <div>
          <span className="mb-1 block text-[11px] text-muted-foreground">ช่วงเวลา</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="ช่วงเวลา">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" aria-pressed={preset === p.key} className={chipClass(preset === p.key)} onClick={() => setPreset(p.key)}>
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
        <div className="grid grid-cols-2 gap-3">
          <FilterField label="ช่องทาง">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`${filterSelectClass} w-full`} aria-label="ช่องทาง">
              <option value="">ทุกช่องทาง</option>
              {channels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="ที่มา (ตามชีต)">
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={`${filterSelectClass} w-full`} aria-label="ที่มา">
              <option value="">ทุกที่มา</option>
              {origins.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </FilterField>
        </div>
        {origin && <p className="text-xs text-muted-foreground">ตอนเลือกที่มา สินค้ายกเลิกไม่แสดง เพราะไม่มีช่อง “ที่มา”</p>}
      </div>

      {asOf && behind !== null && behind > 1 && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p className="text-foreground">
            <b>ข้อมูลถึงวันที่ {formatFullDateLabel(asOf)}</b> (ช้ากว่าวันนี้ {num(behind)} วัน) ตัวเลขของวันที่ใหม่กว่านั้นจึงเป็น 0 เพราะยังไม่มีข้อมูลเข้ามา ไม่ได้แปลว่าไม่มีของคืน
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
            icon={PackageCheck}
            label="รับของคืนเข้าคลัง"
            value={<>{num(s.received.count)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></>}
            sub={[sub(s.received), deltaText(s.received.count, s.receivedBefore.count)].filter(Boolean).join(" · ")}
          />
          <StatTile
            tone="warn"
            icon={PackageSearch}
            label="ค้างรับคืน (ตอนนี้)"
            value={<>{num(s.outstanding.count)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></>}
            sub={`${s.outstanding.oldestDays !== null ? `นานสุด ${num(s.outstanding.oldestDays)} วัน · ` : ""}ไม่ขึ้นกับช่วงเวลา`}
          />
          <StatTile
            tone="danger"
            icon={PackageX}
            label="สูญหาย"
            value={<>{num(s.lost.count)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></>}
            sub={[sub(s.lost), deltaText(s.lost.count, s.lostBefore.count)].filter(Boolean).join(" · ")}
          />
          <StatTile
            tone="warn"
            icon={FileText}
            label="ขอเงินคืนอยู่ (ตอนนี้)"
            value={<>{num(s.money.claimed.count)} <span className="text-sm font-semibold text-muted-foreground">รายการ</span></>}
            sub={s.money.claimed.count ? `รอเงิน${s.money.claimed.amount ? ` ${baht(s.money.claimed.amount)}` : ""} · ไม่ขึ้นกับช่วงเวลา` : "ไม่มีเรื่องรอเงิน"}
          />
          <div className="col-span-2 lg:col-span-2">
            <StatTile
              tone="ok"
              icon={Banknote}
              label="ได้เงินคืนแล้ว (ในช่วงนี้)"
              value={<>{num(s.money.paid.count)} <span className="text-sm font-semibold text-muted-foreground">รายการ{s.money.paid.amount ? ` · ${baht(s.money.paid.amount)}` : ""}</span></>}
              sub={s.money.unnoted.count ? `ยังมีเงินเข้าแล้วแต่ไม่ได้ลงบันทึกอีก ${num(s.money.unnoted.count)} รายการ${s.money.unnoted.amount ? ` (${baht(s.money.unnoted.amount)})` : ""}` : "ปิดเคสแล้ว"}
            />
          </div>
        </div>
        {s.lostUndated > 0 && (
          <p className="text-xs text-muted-foreground">มีพัสดุสูญหาย {num(s.lostUndated)} รายการที่ไม่มีวันที่ในชีต จึงไม่ถูกนับในช่วงเวลาใดเลย (ดูได้ในแท็บ “สูญหาย / เงินคืน”)</p>
        )}
      </section>

      <section className="space-y-3" aria-label="เงินคืนอยู่ขั้นไหน">
        <div>
          <h3 className="page-heading text-xl font-extrabold text-foreground">เงินคืนอยู่ขั้นไหน</h3>
          <ClampText className="text-sm text-muted-foreground">
            เคสที่ต้องเรียกเงินคืน (พัสดุสูญหาย และของคืนที่ทีมติดป้ายขอเงินจากขนส่ง) สามขั้นแรกคือเรื่องที่ยังต้องตามตอนนี้ นับทุกวันที่ เพราะส่วนใหญ่ไม่มีวันที่ในชีต ขั้นสุดท้ายนับตามช่วงที่เลือก
          </ClampText>
        </div>
        <div className="glass-panel divide-y divide-border rounded-2xl px-4">
          {STAGES.map((st, i) => {
            const t = s.money[st.key]
            const closed = st.key === "paid"
            return (
              <div key={st.key} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                      {st.label}
                      <StatusPill tone={st.tone} small>{closed ? "ช่วงที่เลือก" : "ตอนนี้"}</StatusPill>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{st.hint}</p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className="text-xl font-extrabold text-foreground">{num(t.count)}</p>
                    <p className="text-xs text-muted-foreground">{t.amount ? baht(t.amount) : "ไม่มียอด"}</p>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${st.label} ${num(t.count)} รายการ`}>
                  <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.round((t.count / maxStage) * 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          “ยังไม่ได้ทำเรื่อง” นับจากเคสที่ไม่มีทั้งข้อความและป้ายใน BigSeller ถ้าทีมทำเรื่องแล้วแต่ไม่ได้บันทึก เคสจะยังอยู่ขั้นนี้ แถบเทียบกับขั้นที่มากสุดในหน้านี้
        </p>
      </section>

      <section className="space-y-3" aria-label="สินค้ายกเลิก">
        <div>
          <h3 className="page-heading text-xl font-extrabold text-foreground">สินค้ายกเลิก</h3>
          <ClampText className="text-sm text-muted-foreground">
            ออเดอร์ที่ยกเลิกในช่วงที่เลือก (นับตามวันที่ออเดอร์) แยกตามว่าตัดสต็อกไปแล้วหรือยัง
          </ClampText>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            tone={s.cancelled.deducted.openAll > 0 ? "warn" : "ok"}
            icon={Ban}
            label="ตัดสต็อกแล้ว"
            value={<>{num(s.cancelled.deducted.count)} <span className="text-sm font-semibold text-muted-foreground">ออเดอร์</span></>}
            sub={`ต้องรับของคืนเข้าคลัง · ค้างต้องตาม ${num(s.cancelled.deducted.open)} (ทั้งหมดตอนนี้ ${num(s.cancelled.deducted.openAll)})`}
          />
          <StatTile
            tone={s.cancelled.notDeducted.openAll > 0 ? "warn" : "ok"}
            icon={Hourglass}
            label="ยังไม่ตัดสต็อก"
            value={<>{num(s.cancelled.notDeducted.count)} <span className="text-sm font-semibold text-muted-foreground">ออเดอร์</span></>}
            sub={`ต้องเก็บของกลับเข้าที่ · ค้างต้องตาม ${num(s.cancelled.notDeducted.open)} (ทั้งหมดตอนนี้ ${num(s.cancelled.notDeducted.openAll)})`}
          />
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill tone="warn" icon={Clock} small>ค้างต้องตาม</StatusPill>
          คือออเดอร์ที่ยังรอตรวจสอบหรือสแกนไม่ตรง ดูรายการได้ที่แท็บ “ตัดสต็อกแล้ว” และ “ยังไม่ตัดสต็อก”
        </p>
      </section>
    </div>
  )
}
