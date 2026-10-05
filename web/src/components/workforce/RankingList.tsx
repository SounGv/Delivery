import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { Avatar3D } from "./Avatar3D"
import { cn } from "@/lib/utils"
import { breakdownStats } from "./breakdownStats"
import type { RankedEmployeeMetric } from "@/lib/workforce"

function emotionFor(pctTarget: number | null) {
  if (pctTarget === null) return "calm" as const
  if (pctTarget >= 100) return "great" as const
  if (pctTarget >= 80) return "good" as const
  return "calm" as const
}

function RankChange({ delta }: { delta: number | undefined }) {
  if (delta === undefined) return null
  if (delta > 0)
    return (
      <span className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-glow">
        <ArrowUp className="size-3" /> {delta}
      </span>
    )
  if (delta < 0)
    return (
      <span className="flex items-center gap-0.5 text-[11px] font-bold text-destructive">
        <ArrowDown className="size-3" /> {Math.abs(delta)}
      </span>
    )
  return (
    <span className="flex items-center gap-0.5 text-[11px] font-bold text-muted-foreground">
      <Minus className="size-3" /> 0
    </span>
  )
}

/** Flip7 scoring-item cards: white card, 6px colored left accent bar to communicate state
 * (teal by default, gold + soft gold glow for someone who climbed the ranking). */
export function RankingList({
  entries,
  rankDeltas,
  metricFormatter,
  showTarget = true,
  hideStat,
}: {
  entries: RankedEmployeeMetric[]
  rankDeltas: Map<string, number>
  metricFormatter: (m: RankedEmployeeMetric) => string
  showTarget?: boolean
  /** Breakdown figure to leave out of the small stats line because the ranking already headlines it. */
  hideStat?: string
}) {
  return (
    <div className="space-y-2">
      {entries.map((m) => {
        const climbed = (rankDeltas.get(m.name) ?? 0) > 0
        return (
          <div
            key={m.name}
            className={cn(
              "flex items-center gap-3 rounded-2xl border border-l-[6px] bg-card p-2.5 shadow-[0_4px_20px_rgba(43,168,162,0.10)] transition-transform hover:-translate-y-0.5",
              climbed
                ? "border-border border-l-gold bg-gradient-to-r from-gold/15 to-card shadow-[0_4px_20px_rgba(255,210,63,0.30)]"
                : "border-border border-l-brand-400"
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-extrabold text-foreground">
              {m.rank}
            </span>
            <Avatar3D name={m.name} emotion={emotionFor(m.pctTarget)} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold tracking-wide text-foreground">{m.name}</p>
              <p className="text-xs font-medium text-muted-foreground">{metricFormatter(m)}</p>
              {breakdownStats(m, hideStat).length > 0 && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {breakdownStats(m, hideStat)
                    .map((s) => `${s.label} ${s.value}`)
                    .join(" · ")}
                </p>
              )}
            </div>
            {showTarget && m.pctTarget !== null && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                  m.pctTarget >= 100
                    ? "bg-emerald-glow/15 text-emerald-glow"
                    : m.pctTarget >= 80
                      ? "bg-gold/30 text-foreground"
                      : "bg-brand-500/15 text-primary"
                )}
              >
                {m.pctTarget.toFixed(0)}%
              </span>
            )}
            <div className="w-10 shrink-0">
              <RankChange delta={rankDeltas.get(m.name)} />
            </div>
          </div>
        )
      })}
      {entries.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงเวลาที่เลือก</p>}
    </div>
  )
}
