import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Banknote, Coins, Minus, PackageCheck, Target, Warehouse } from "lucide-react"
import { useAnimatedNumber } from "@/lib/useAnimatedNumber"
import { cn } from "@/lib/utils"

const num = (n: number) => n.toLocaleString("th-TH")
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`
/** Millions get shortened so the figure fits a half-width tile on a phone; the full amount stays in the tooltip. */
const compactBaht = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)} ล้าน` : baht(n))

/** A number that counts up when it first appears. */
function Count({ value, format = num }: { value: number; format?: (n: number) => string }) {
  const animated = useAnimatedNumber(value)
  return <>{format(Math.round(animated))}</>
}

/** Day-over-day change on a dark background: white chip, arrow + sign carry the direction. */
function HeroTrend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-white/80">ไม่มีข้อมูลเทียบวันก่อน</span>
  const flat = Math.abs(value) < 0.05
  const Icon = flat ? Minus : value > 0 ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-extrabold shadow-sm",
        flat ? "text-slate-600" : value > 0 ? "text-emerald-700" : "text-rose-700"
      )}
    >
      <Icon className="size-3" />
      {Math.abs(value).toFixed(1)}% <span className="font-medium opacity-80">เทียบวันก่อน</span>
    </span>
  )
}

function HeroTile({
  icon: Icon,
  label,
  onClick,
  children,
  sub,
  valueTitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  children: React.ReactNode
  sub?: React.ReactNode
  /** Full-precision value shown as a tooltip when the visible one is shortened. */
  valueTitle?: string
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs font-bold text-white/90">
        <span className="flex size-6 items-center justify-center rounded-lg bg-white/20">
          <Icon className="size-3.5" />
        </span>
        {label}
        {onClick && <ArrowRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
      </p>
      <p title={valueTitle} className="mt-2 text-2xl font-extrabold leading-none tabular-nums tracking-tight drop-shadow-sm sm:text-4xl">
        {children}
      </p>
      {sub && <div className="mt-2 min-h-5 text-xs text-white/85">{sub}</div>}
    </>
  )
  const cls =
    "group rounded-2xl bg-[#082a27]/40 p-4 text-left text-white shadow-[0_14px_28px_-16px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-white/20 backdrop-blur-md transition-all"
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "hover:-translate-y-0.5 hover:bg-[#082a27]/55 hover:ring-white/40")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export interface OverviewHeroProps {
  /** Short date label of the newest data, e.g. "09 พ.ย. 2026". */
  dataDateLabel: string
  needAction: number
  teamLabel: string
  parcels: number
  parcelTrend: number | null
  activeEmployees: number
  /** null = no target to compare with. */
  targetPct: number | null
  targetLabel?: string
  sales: { net: number; monthLabel: string; note?: string } | null
  stockTotal: number | null
  onOpenTeam: () => void
  onOpenSales: () => void
  onOpenStock: () => void
}

/** The first thing on the overview: page title, one verdict ("how many things need someone today"),
 * and the four numbers a manager looks for first. Dark teal on purpose, so white text stays readable
 * (>= 4.5:1) and the page has one clearly dominant block. */
export function OverviewHero(p: OverviewHeroProps) {
  const pct = p.targetPct === null ? null : Math.max(0, Math.min(100, p.targetPct))
  return (
    <section
      aria-label="สรุปภาพรวม"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3a37] via-[#125e59] to-[#17706b] p-5 text-white shadow-[0_30px_70px_-30px_rgba(11,58,55,0.95)] ring-1 ring-white/10 sm:p-8"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <span className="absolute -right-16 -top-20 size-72 rounded-full bg-brand-400/30 blur-3xl" />
        <span className="absolute -bottom-24 left-1/4 size-64 rounded-full bg-gold/15 blur-3xl" />
        {[-24, -12, 0, 12, 24].map((deg, i) => (
          <span
            key={deg}
            className="absolute right-6 top-0 hidden h-36 w-24 origin-bottom rounded-xl bg-white/[0.06] ring-1 ring-white/15 lg:block"
            style={{ transform: `translateX(${-i * 26}px) rotate(${deg}deg)` }}
          />
        ))}
      </div>

      <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/30">
              <Warehouse className="size-6" />
            </span>
            <span className="rounded-full bg-gold px-3 py-1 text-xs font-extrabold text-[#5c4300] shadow-[0_6px_16px_rgba(255,210,63,0.45)]">
              ข้อมูลล่าสุด {p.dataDateLabel}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-wide drop-shadow-md sm:text-4xl">ภาพรวมทีมคลัง</h1>
          <p className="mt-1 text-sm text-white/85">ฝ่าย{p.teamLabel} · พนักงานที่ทำงานวันนี้ {num(p.activeEmployees)} คน</p>

          <div className="mt-5">
            {p.needAction > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-rose-700 shadow-[0_10px_26px_-8px_rgba(244,63,94,0.7)] ring-2 ring-rose-300/70">
                <AlertTriangle className="size-4" />
                วันนี้มี {num(p.needAction)} เรื่องต้องตาม
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-emerald-700 shadow-[0_10px_26px_-8px_rgba(39,174,96,0.7)] ring-2 ring-emerald-300/70">
                วันนี้ไม่มีเรื่องค้าง
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <HeroTile icon={PackageCheck} label="พัสดุวันนี้" onClick={p.onOpenTeam} sub={<HeroTrend value={p.parcelTrend} />}>
            <Count value={p.parcels} />
          </HeroTile>
          <HeroTile
            icon={Target}
            label="ถึงเป้า"
            onClick={p.onOpenTeam}
            sub={
              pct === null ? (
                <span>ไม่มีเป้าให้เทียบ</span>
              ) : (
                <div className="h-2 overflow-hidden rounded-full bg-white/25" role="img" aria-label={`ถึงเป้า ${pct.toFixed(0)} เปอร์เซ็นต์`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-gold-light to-gold shadow-[0_0_10px_rgba(255,210,63,0.7)]" style={{ width: `${pct}%` }} />
                </div>
              )
            }
          >
            {pct === null ? "—" : <><Count value={pct} />%</>}
          </HeroTile>
          <HeroTile
            icon={Banknote}
            label={p.sales ? `ยอดขายสุทธิ · ${p.sales.monthLabel}` : "ยอดขายสุทธิ"}
            onClick={p.onOpenSales}
            sub={p.sales?.note ?? "หลังหักคืนเงิน"}
            valueTitle={p.sales ? baht(p.sales.net) : undefined}
          >
            {p.sales ? <Count value={p.sales.net} format={compactBaht} /> : "—"}
          </HeroTile>
          <HeroTile
            icon={Coins}
            label="มูลค่าสต็อก"
            onClick={p.onOpenStock}
            sub="ต้นทุน × จำนวนคงเหลือ"
            valueTitle={p.stockTotal === null ? undefined : baht(p.stockTotal)}
          >
            {p.stockTotal === null ? "—" : <Count value={p.stockTotal} format={compactBaht} />}
          </HeroTile>
        </div>
      </div>
    </section>
  )
}
