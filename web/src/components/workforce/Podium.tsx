import { motion } from "framer-motion"
import { Trophy } from "lucide-react"
import { Avatar3D, type AvatarEmotion } from "./Avatar3D"
import { cn } from "@/lib/utils"
import type { RankedEmployeeMetric } from "@/lib/workforce"

function emotionFor(pctTarget: number): AvatarEmotion {
  if (pctTarget >= 100) return "great"
  if (pctTarget >= 80) return "good"
  return "calm"
}

interface PodiumSlotConfig {
  avatarSize: number
  platformHeight: number
  platformGradient: string
  medal: string
}

const SLOT: Record<1 | 2 | 3, PodiumSlotConfig> = {
  1: { avatarSize: 96, platformHeight: 96, platformGradient: "from-amber-300 to-amber-500", medal: "🥇" },
  2: { avatarSize: 76, platformHeight: 68, platformGradient: "from-slate-300 to-slate-400", medal: "🥈" },
  3: { avatarSize: 68, platformHeight: 48, platformGradient: "from-orange-400 to-orange-700", medal: "🥉" },
}

function PodiumSlot({
  entry,
  metricValueLabel,
}: {
  entry: RankedEmployeeMetric
  metricValueLabel: string
}) {
  const slot = SLOT[entry.rank as 1 | 2 | 3]
  const emotion = emotionFor(entry.pctTarget)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: (entry.rank - 1) * 0.08 }}
      className="flex flex-col items-center"
    >
      {entry.rank === 1 && (
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 12 }}
        >
          <Trophy className="mb-1 size-7 text-amber-400 drop-shadow" fill="currentColor" />
        </motion.div>
      )}
      <Avatar3D name={entry.name} emotion={emotion} size={slot.avatarSize} />
      <p className="mt-1 max-w-[6.5rem] truncate text-center text-sm font-semibold text-foreground">{entry.name}</p>
      <p className="text-center text-xs text-muted-foreground">{metricValueLabel}</p>
      <p
        className={cn(
          "text-[11px] font-semibold",
          entry.pctTarget >= 100 ? "text-emerald-glow" : entry.pctTarget >= 80 ? "text-amber-500" : "text-brand-400"
        )}
      >
        {entry.pctTarget.toFixed(0)}% Target
      </p>
      <div
        className={cn(
          "mt-2 flex w-20 items-start justify-center rounded-t-lg bg-gradient-to-b pt-1 text-lg shadow-inner",
          slot.platformGradient
        )}
        style={{ height: slot.platformHeight }}
      >
        {slot.medal}
      </div>
    </motion.div>
  )
}

export function Podium({ top3, metricFormatter }: { top3: RankedEmployeeMetric[]; metricFormatter: (m: RankedEmployeeMetric) => string }) {
  const byRank = new Map(top3.map((m) => [m.rank, m]))
  const first = byRank.get(1)
  const second = byRank.get(2)
  const third = byRank.get(3)

  return (
    <div className="flex items-end justify-center gap-4 sm:gap-8">
      {second && <PodiumSlot entry={second} metricValueLabel={metricFormatter(second)} />}
      {first && <PodiumSlot entry={first} metricValueLabel={metricFormatter(first)} />}
      {third && <PodiumSlot entry={third} metricValueLabel={metricFormatter(third)} />}
    </div>
  )
}
