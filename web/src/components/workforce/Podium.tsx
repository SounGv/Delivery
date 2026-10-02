import { motion } from "framer-motion"
import { Avatar3D, type AvatarEmotion } from "./Avatar3D"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import type { RankedEmployeeMetric } from "@/lib/workforce"

function emotionFor(pctTarget: number | null): AvatarEmotion {
  if (pctTarget === null) return "calm"
  if (pctTarget >= 100) return "great"
  if (pctTarget >= 80) return "good"
  return "calm"
}

interface PodiumSlotConfig {
  avatarSize: number
  platformHeight: number
  platformGradient: string
  platformGlow: string
  medal: string
}

// Flip7 victory tiers: gold winner with an accent glow, silver 2nd, coral/bronze 3rd.
const SLOT: Record<1 | 2 | 3, PodiumSlotConfig> = {
  1: {
    avatarSize: 96,
    platformHeight: 96,
    platformGradient: "from-gold-light to-gold-dark",
    platformGlow: "shadow-[0_4px_20px_rgba(255,210,63,0.45)]",
    medal: "🥇",
  },
  2: {
    avatarSize: 76,
    platformHeight: 68,
    platformGradient: "from-slate-200 to-slate-400",
    platformGlow: "shadow-[0_4px_16px_rgba(148,163,184,0.4)]",
    medal: "🥈",
  },
  3: {
    avatarSize: 68,
    platformHeight: 48,
    platformGradient: "from-coral-light to-coral-dark",
    platformGlow: "shadow-[0_4px_16px_rgba(239,108,74,0.35)]",
    medal: "🥉",
  },
}

// 10 confetti pieces, varied size/shape/color, 3.2-4.5s fall (Flip7 victory spec).
const CONFETTI = [
  { left: "6%", delay: 0, duration: 3.6, color: "bg-gold", size: 8, shape: "rounded-sm" },
  { left: "14%", delay: 0.6, duration: 4.2, color: "bg-coral", size: 6, shape: "rounded-full" },
  { left: "23%", delay: 1.2, duration: 3.4, color: "bg-brand-500", size: 9, shape: "rounded-sm" },
  { left: "33%", delay: 0.3, duration: 4.5, color: "bg-sky-flip", size: 7, shape: "rounded-full" },
  { left: "44%", delay: 0.9, duration: 3.8, color: "bg-gold-light", size: 6, shape: "rounded-sm" },
  { left: "55%", delay: 1.5, duration: 3.3, color: "bg-coral-light", size: 8, shape: "rounded-full" },
  { left: "65%", delay: 0.2, duration: 4.1, color: "bg-emerald-glow", size: 7, shape: "rounded-sm" },
  { left: "75%", delay: 1.0, duration: 3.5, color: "bg-gold", size: 9, shape: "rounded-full" },
  { left: "85%", delay: 0.5, duration: 4.4, color: "bg-brand-400", size: 6, shape: "rounded-sm" },
  { left: "93%", delay: 1.3, duration: 3.2, color: "bg-coral", size: 8, shape: "rounded-sm" },
]

/** Falls three times then stops, and is skipped entirely for reduced-motion users —
 * a dashboard people leave open all day shouldn't loop confetti forever. */
function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {CONFETTI.map((p, i) => (
        <span
          key={i}
          className={cn("absolute top-0 hidden motion-safe:block motion-safe:animate-confetti-fall", p.color, p.shape)}
          style={{
            left: p.left,
            width: p.size,
            height: p.size * 1.4,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  )
}

function PodiumSlot({
  entry,
  metricValueLabel,
  showTarget,
}: {
  entry: RankedEmployeeMetric
  metricValueLabel: string
  showTarget: boolean
}) {
  const slot = SLOT[entry.rank as 1 | 2 | 3]
  const emotion = emotionFor(entry.pctTarget)
  const isWinner = entry.rank === 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: (entry.rank - 1) * 0.08 }}
      className="flex flex-col items-center"
    >
      {isWinner && (
        <div className="mb-1 text-3xl leading-none motion-safe:animate-crown-bounce" aria-hidden>
          <span className="block drop-shadow">👑</span>
        </div>
      )}
      <div className="relative">
        {isWinner && (
          <div
            className="absolute inset-[-10px] rounded-full bg-gold/40 blur-xl motion-safe:animate-glow-pulse"
            aria-hidden
          />
        )}
        <div className="relative">
          <Avatar3D name={entry.name} emotion={emotion} size={slot.avatarSize} />
        </div>
      </div>
      <p className="mt-1 max-w-[6.5rem] truncate text-center text-sm font-extrabold tracking-wide text-foreground">{entry.name}</p>
      <p className="text-center text-xs font-medium text-muted-foreground">{metricValueLabel}</p>
      {showTarget && entry.pctTarget !== null && (
        <p
          className={cn(
            "mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
            entry.pctTarget >= 100
              ? "bg-emerald-glow/15 text-emerald-glow"
              : entry.pctTarget >= 80
                ? "bg-gold/30 text-foreground"
                : "bg-brand-500/15 text-primary"
          )}
        >
          {entry.pctTarget.toFixed(0)}% Target
        </p>
      )}
      {entry.pdaPick !== undefined && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-center text-[10px] leading-tight text-muted-foreground">
          <span>PDA {formatNumber(entry.pdaPick)}</span>
          <span>ป้าย {formatNumber(entry.printLabel ?? 0)}</span>
          <span>Wave {formatNumber(entry.pickWaveCount ?? 0)}</span>
          <span>SKU {formatNumber(entry.pickSku ?? 0)}</span>
        </div>
      )}
      <div
        className={cn(
          "mt-2 flex w-20 items-start justify-center rounded-t-2xl bg-gradient-to-b pt-1.5 text-xl",
          slot.platformGradient,
          slot.platformGlow
        )}
        style={{ height: slot.platformHeight }}
      >
        <span aria-hidden>{slot.medal}</span>
      </div>
    </motion.div>
  )
}

export function Podium({
  top3,
  metricFormatter,
  showTarget = true,
}: {
  top3: RankedEmployeeMetric[]
  metricFormatter: (m: RankedEmployeeMetric) => string
  showTarget?: boolean
}) {
  const byRank = new Map(top3.map((m) => [m.rank, m]))
  const first = byRank.get(1)
  const second = byRank.get(2)
  const third = byRank.get(3)

  return (
    <div className="relative rounded-2xl bg-gradient-to-b from-gold/15 to-transparent px-2 pt-6">
      <Confetti />
      <div className="relative flex items-end justify-center gap-4 sm:gap-8">
        {second && <PodiumSlot entry={second} metricValueLabel={metricFormatter(second)} showTarget={showTarget} />}
        {first && <PodiumSlot entry={first} metricValueLabel={metricFormatter(first)} showTarget={showTarget} />}
        {third && <PodiumSlot entry={third} metricValueLabel={metricFormatter(third)} showTarget={showTarget} />}
      </div>
    </div>
  )
}
