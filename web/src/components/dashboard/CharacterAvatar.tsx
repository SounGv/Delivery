import { colorForName } from "@/lib/avatarColor"
import type { KpiStatus } from "@/lib/status"

const SKIN = ["#fde0c8", "#f5c9a0", "#e0a979", "#c68642", "#8d5524"]
const HAIR = ["#2b1b10", "#4a2f1b", "#1c1c1c", "#7a4a21", "#b5651d", "#3b3b6b"]

/** A stable number from a name, so the same person always gets the same face. */
function hashOf(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const INK = "#3a2a1a"

/**
 * A small cartoon character for one employee. Hair, skin, glasses and background colour come from the
 * name (stable); the face comes from the KPI status: smiling on target, flat when close, worried with a
 * sweat drop when below target, asleep when there is no data. The name is always printed next to it,
 * so the picture is decoration (aria-hidden) and never the only carrier of the status.
 */
export function CharacterAvatar({ name, status, size = 56 }: { name: string; status: KpiStatus; size?: number }) {
  const h = hashOf(name)
  const skin = SKIN[h % SKIN.length] ?? SKIN[0]
  const hair = HAIR[(h >>> 3) % HAIR.length] ?? HAIR[0]
  const style = (h >>> 6) % 4
  const glasses = (h >>> 9) % 4 === 0
  const bg = colorForName(name).base
  const asleep = status === "no-data"

  const hairFront =
    style === 1 ? (
      <path d="M17 36 C15 20 22 13 32 13 C42 13 49 20 47 36 C46 40 44 40 43 36 L43 28 C40 24 24 24 21 28 L21 36 C20 40 18 40 17 36Z" fill={hair} />
    ) : style === 2 ? (
      <path d="M18 28 L20 15 L26 21 L30 12 L35 21 L41 14 L45 28 C41 23 37 21 32 21 C27 21 23 23 18 28Z" fill={hair} />
    ) : (
      <>
        {style === 3 && <circle cx="32" cy="11" r="6" fill={hair} />}
        <path d="M18 30 C18 18 24 14 32 14 C40 14 46 18 46 30 C42 24 38 22 32 22 C26 22 22 24 18 30Z" fill={hair} />
      </>
    )

  const happy = status === "on-target"
  const worried = status === "below-target"

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0 overflow-visible">
      <defs>
        <clipPath id={`c-${h}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#c-${h})`} opacity={asleep ? 0.8 : 1}>
        <circle cx="32" cy="32" r="32" fill={bg} />
        <circle cx="22" cy="14" r="22" fill="#fff" opacity="0.18" />
        {/* shoulders and neck */}
        <ellipse cx="32" cy="66" rx="24" ry="17" fill="#ffffff" opacity="0.92" />
        <rect x="28" y="40" width="8" height="9" rx="3" fill={skin} />
        <rect x="28" y="40" width="8" height="4" rx="2" fill="#000" opacity="0.08" />
        {style === 1 && <path d="M17 36 C15 20 22 13 32 13 C42 13 49 20 47 36 Z" fill={hair} />}
        {/* head */}
        <circle cx="32" cy="31" r="14.5" fill={skin} />
        {hairFront}
        {/* cheeks */}
        {(happy || status === "watch" || status === "no-target") && (
          <>
            <circle cx="22.5" cy="36" r="2.6" fill="#ff8a8a" opacity="0.45" />
            <circle cx="41.5" cy="36" r="2.6" fill="#ff8a8a" opacity="0.45" />
          </>
        )}
        {/* brows */}
        {worried && (
          <>
            <path d="M22.5 27.5 L28.5 25.5" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M35.5 25.5 L41.5 27.5" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
        {status === "watch" && <path d="M35.5 26 L41 25" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />}
        {/* eyes */}
        {happy ? (
          <>
            <path d="M23.5 32 Q26 28.5 28.5 32" stroke={INK} strokeWidth="1.9" fill="none" strokeLinecap="round" />
            <path d="M35.5 32 Q38 28.5 40.5 32" stroke={INK} strokeWidth="1.9" fill="none" strokeLinecap="round" />
          </>
        ) : asleep ? (
          <>
            <path d="M23.5 31 Q26 33.5 28.5 31" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M35.5 31 Q38 33.5 40.5 31" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="26" cy="31.5" r="2" fill={INK} />
            <circle cx="38" cy="31.5" r="2" fill={INK} />
            <circle cx="26.7" cy="30.8" r="0.7" fill="#fff" />
            <circle cx="38.7" cy="30.8" r="0.7" fill="#fff" />
          </>
        )}
        {glasses && (
          <g stroke="#2d3748" strokeWidth="1.2" fill="none">
            <circle cx="26" cy="31.5" r="4.6" />
            <circle cx="38" cy="31.5" r="4.6" />
            <path d="M30.6 31.2 L33.4 31.2" />
          </g>
        )}
        {/* mouth */}
        {happy ? (
          <path d="M26.5 38.5 Q32 44.5 37.5 38.5 Q32 41 26.5 38.5Z" fill="#b3402e" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
        ) : worried ? (
          <path d="M27 42 Q32 37.5 37 42" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        ) : asleep ? (
          <path d="M29.5 39.5 Q32 41 34.5 39.5" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        ) : status === "no-target" ? (
          <path d="M28 39 Q32 42 36 39" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M28 40 L36 40" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
        )}
      </g>
      {/* status extras sit outside the clip so they can overlap the edge */}
      {worried && <path d="M51 14 Q55 20 51 23 Q47 20 51 14Z" fill="#7dd3fc" stroke="#38bdf8" strokeWidth="0.8" />}
      {happy && (
        <path d="M52 8 L53.6 12.4 L58 14 L53.6 15.6 L52 20 L50.4 15.6 L46 14 L50.4 12.4Z" fill="#ffd23f" stroke="#e6b800" strokeWidth="0.6" />
      )}
      {asleep && (
        <text x="48" y="16" fontSize="11" fontWeight="800" fill="#64748b">
          z
        </text>
      )}
    </svg>
  )
}
