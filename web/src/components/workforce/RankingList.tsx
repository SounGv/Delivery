import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { Avatar3D } from "./Avatar3D"
import { cn } from "@/lib/utils"
import type { RankedEmployeeMetric } from "@/lib/workforce"

function emotionFor(pctTarget: number) {
  if (pctTarget >= 100) return "great" as const
  if (pctTarget >= 80) return "good" as const
  return "calm" as const
}

function RankChange({ delta }: { delta: number | undefined }) {
  if (delta === undefined) return null
  if (delta > 0)
    return (
      <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-glow">
        <ArrowUp className="size-3" /> {delta}
      </span>
    )
  if (delta < 0)
    return (
      <span className="flex items-center gap-0.5 text-[11px] font-semibold text-destructive">
        <ArrowDown className="size-3" /> {Math.abs(delta)}
      </span>
    )
  return (
    <span className="flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground">
      <Minus className="size-3" /> 0
    </span>
  )
}

export function RankingList({
  entries,
  rankDeltas,
  metricFormatter,
}: {
  entries: RankedEmployeeMetric[]
  rankDeltas: Map<string, number>
  metricFormatter: (m: RankedEmployeeMetric) => string
}) {
  return (
    <div className="space-y-1.5">
      {entries.map((m) => (
        <div key={m.name} className="glass-panel flex items-center gap-3 rounded-xl p-2.5">
          <span className="w-7 shrink-0 text-center text-xs font-semibold text-muted-foreground">#{m.rank}</span>
          <Avatar3D name={m.name} emotion={emotionFor(m.pctTarget)} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{m.name}</p>
            <p className="text-xs text-muted-foreground">{metricFormatter(m)}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              m.pctTarget >= 100
                ? "bg-emerald-glow/15 text-emerald-glow"
                : m.pctTarget >= 80
                  ? "bg-amber-500/15 text-amber-500"
                  : "bg-brand-500/15 text-brand-400"
            )}
          >
            {m.pctTarget.toFixed(0)}%
          </span>
          <div className="w-10 shrink-0">
            <RankChange delta={rankDeltas.get(m.name)} />
          </div>
        </div>
      ))}
      {entries.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงเวลาที่เลือก</p>}
    </div>
  )
}
