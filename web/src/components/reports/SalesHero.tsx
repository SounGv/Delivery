import { Coins, Receipt, RotateCcw, ShoppingCart, TicketPercent, Wallet } from "lucide-react"
import type { OrderReportTotals } from "@/lib/order-report-selectors"
import { useAnimatedNumber } from "@/lib/useAnimatedNumber"

const money = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`
/** Millions get shortened so the figure fits a half-width tile on a phone; the full amount stays in the tooltip. */
const compactMoney = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)} ล้าน` : money(n))

function Count({ value, format }: { value: number; format: (n: number) => string }) {
  const animated = useAnimatedNumber(value)
  return <>{format(animated)}</>
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  sub?: string
  title?: string
}) {
  return (
    <div className="rounded-2xl bg-[#082a27]/40 p-4 text-white shadow-[0_14px_28px_-16px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-white/20 backdrop-blur-md">
      <p className="flex items-center gap-1.5 text-xs font-bold text-white/90">
        <span className="flex size-6 items-center justify-center rounded-lg bg-white/20">
          <Icon className="size-3.5" />
        </span>
        {label}
      </p>
      <p title={title} className="mt-2 text-2xl font-extrabold leading-none tabular-nums tracking-tight drop-shadow-sm sm:text-3xl">
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-white/85">{sub}</p>}
    </div>
  )
}

export interface SalesHeroProps {
  totals: OrderReportTotals
  netSales: number
  netPct: number
  avgPerDay: number
  /** Effective sales per channel over the same range, for the split bar. */
  onlineSales: number
  offlineSales: number
  channelLabel: string
  rangeLabel: string
}

/** The block at the top of the sales page: the net sales figure big, how it splits between online and
 * offline, and the five numbers next to it. Dark teal so white text stays readable. */
export function SalesHero(p: SalesHeroProps) {
  const split = p.onlineSales + p.offlineSales
  const onlinePct = split > 0 ? (p.onlineSales / split) * 100 : 0
  const t = p.totals
  return (
    <section
      aria-label="สรุปยอดขาย"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3a37] via-[#125e59] to-[#17706b] p-5 text-white shadow-[0_30px_70px_-30px_rgba(11,58,55,0.95)] ring-1 ring-white/10 sm:p-8"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <span className="absolute -right-16 -top-20 size-72 rounded-full bg-brand-400/30 blur-3xl" />
        <span className="absolute -bottom-24 left-1/4 size-64 rounded-full bg-gold/15 blur-3xl" />
      </div>

      <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/30">
              <Wallet className="size-6" />
            </span>
            <span className="rounded-full bg-gold px-3 py-1 text-xs font-extrabold text-[#5c4300] shadow-[0_6px_16px_rgba(255,210,63,0.45)]">
              {p.channelLabel}
            </span>
          </div>
          <p className="mt-4 text-sm font-bold text-white/85">ยอดขายสุทธิ (หลังหักคืนเงิน)</p>
          <p
            className="text-4xl font-extrabold leading-tight tabular-nums tracking-tight drop-shadow-md sm:text-6xl"
            title={money(p.netSales)}
          >
            <Count value={p.netSales} format={money} />
          </p>
          <p className="mt-1 text-sm text-white/85">
            {p.rangeLabel} · {t.nDays.toLocaleString("th-TH")} วัน · เฉลี่ย {money(p.avgPerDay)}/วัน
          </p>
          <p className="mt-0.5 text-xs text-white/75">
            ยอดขายมีผล {money(t.totalEffSales)} · สุทธิ {p.netPct.toFixed(1)}% · คืนเงิน {money(t.totalRefundAmount)}
          </p>

          {split > 0 && (
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between gap-2 text-xs font-semibold text-white/90">
                <span>ออนไลน์ {onlinePct.toFixed(0)}% · {compactMoney(p.onlineSales)}</span>
                <span>ออฟไลน์ {(100 - onlinePct).toFixed(0)}% · {compactMoney(p.offlineSales)}</span>
              </div>
              <div className="flex h-3.5 overflow-hidden rounded-full bg-black/25 shadow-inner" role="img" aria-label={`ออนไลน์ ${onlinePct.toFixed(0)} เปอร์เซ็นต์ ออฟไลน์ ${(100 - onlinePct).toFixed(0)} เปอร์เซ็นต์`}>
                <div className="h-full rounded-l-full bg-gradient-to-r from-brand-400 to-[#7fe0da] shadow-[0_0_12px_rgba(60,196,189,0.6)]" style={{ width: `${onlinePct}%` }} />
                <div className="h-full rounded-r-full bg-gradient-to-r from-gold-light to-gold" style={{ width: `${100 - onlinePct}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile icon={Coins} label="ยอดขายรวม (มีผล)" value={<Count value={t.totalEffSales} format={compactMoney} />} title={money(t.totalEffSales)} sub={`เฉลี่ย ${money(p.avgPerDay)}/วัน`} />
          <Tile
            icon={ShoppingCart}
            label="คำสั่งซื้อที่มีผล"
            value={<Count value={t.totalEffOrders} format={(n) => Math.round(n).toLocaleString("th-TH")} />}
            sub={`จากทั้งหมด ${t.totalOrders.toLocaleString("th-TH")} ออเดอร์`}
          />
          <Tile icon={Receipt} label="AOV เฉลี่ย" value={`฿${t.weightedAov.toFixed(2)}`} sub="ต่อคำสั่งซื้อ 1 รายการ" />
          <Tile icon={RotateCcw} label="อัตราคืนเงินเฉลี่ย" value={`${t.avgRefundRate.toFixed(2)}%`} sub={`คืนเงิน ${money(t.totalRefundAmount)}`} />
          <Tile
            icon={TicketPercent}
            label="ยอดใช้โค้ดส่วนลด"
            value={<Count value={t.totalDiscountCode} format={compactMoney} />}
            title={money(t.totalDiscountCode)}
            sub={`${((t.totalDiscountCode / (t.totalEffSales || 1)) * 100).toFixed(1)}% ของยอดขายรวม`}
          />
          <Tile
            icon={Wallet}
            label="ยกเลิก"
            value={`${t.cancelRate.toFixed(1)}%`}
            sub={`${t.totalCancelledOrders.toLocaleString("th-TH")} ออเดอร์`}
          />
        </div>
      </div>
    </section>
  )
}
