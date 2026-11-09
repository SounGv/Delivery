import { AlertTriangle, CheckCircle2, ChevronRight, Clock, HelpCircle } from "lucide-react"
import { StatusPill, type Tone } from "@/components/returns/ReturnsUi"
import { cn } from "@/lib/utils"

type IconType = React.ComponentType<{ className?: string }>

export interface AttentionItem {
  key: string
  tone: Tone
  icon: IconType
  label: string
  /** null = the number could not be read; shown as "—" rather than a misleading 0. */
  count: number | null
  unit: string
  sub: string
  onOpen: () => void
}

const ORDER: Record<Tone, number> = { danger: 0, warn: 1, info: 2, neutral: 3, ok: 4 }

const STATE: Record<Tone, { word: string; icon: IconType }> = {
  danger: { word: "เลยกำหนด/ผิดปกติ", icon: AlertTriangle },
  warn: { word: "รอดำเนินการ", icon: Clock },
  info: { word: "บางส่วน", icon: Clock },
  neutral: { word: "อ่านข้อมูลไม่ได้", icon: HelpCircle },
  ok: { word: "ไม่มีค้าง", icon: CheckCircle2 },
}

const STRIPE: Record<Tone, string> = {
  danger: "bg-rose-500",
  warn: "bg-amber-500",
  info: "bg-sky-500",
  neutral: "bg-border",
  ok: "bg-emerald-500",
}

/** "ต้องตามวันนี้" as one ranked list: most urgent first, each row says what it is, how many, and opens its menu. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const ranked = [...items].sort((a, b) => ORDER[a.tone] - ORDER[b.tone] || (b.count ?? 0) - (a.count ?? 0))
  return (
    <ul className="glass-panel divide-y divide-border/60 overflow-hidden rounded-2xl">
      {ranked.map((item) => {
        const state = STATE[item.tone]
        const Icon = item.icon
        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={item.onOpen}
              className="relative flex w-full items-center gap-3 py-3 pl-5 pr-3 text-left transition-colors hover:bg-muted/40"
            >
              <span className={cn("absolute inset-y-0 left-0 w-1.5", STRIPE[item.tone])} aria-hidden />
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold leading-snug text-foreground">{item.label}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{item.sub}</span>
              </span>
              <span className="hidden sm:block">
                <StatusPill tone={item.tone} icon={state.icon} small>
                  {state.word}
                </StatusPill>
              </span>
              <span className="w-20 shrink-0 text-right text-2xl sm:w-24 font-extrabold tabular-nums text-foreground">
                {item.count === null ? "—" : item.count.toLocaleString("th-TH")}
                <span className="ml-1 text-xs font-semibold text-muted-foreground">{item.unit}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
