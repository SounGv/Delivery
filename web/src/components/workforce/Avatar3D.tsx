import { colorForName } from "@/lib/avatarColor"

export type AvatarEmotion = "great" | "good" | "calm"

interface Avatar3DProps {
  name: string
  emotion: AvatarEmotion
  size?: number
  className?: string
}

/** Arm rotation (degrees, 0 = hanging straight down) per emotion — "great" cheers with both arms
 * up, "good" gives an encouraging single raised arm, "calm" is a relaxed neutral stance. Every
 * pose keeps a smile: this is meant to motivate, never to shame a lower performer. */
const ARM_ANGLES: Record<AvatarEmotion, { left: number; right: number }> = {
  great: { left: -155, right: 155 },
  good: { left: 15, right: -110 },
  calm: { left: 12, right: -12 },
}

const MOUTH_DEPTH: Record<AvatarEmotion, number> = { great: 16, good: 11, calm: 7 }

/** Stylized flat/CSS-look "3D" character (gradient shading + gloss highlights fake depth) — no
 * WebGL, no external 3D assets, and never a real photo. */
export function Avatar3D({ name, emotion, size = 72, className }: Avatar3DProps) {
  const color = colorForName(name)
  const gradId = `avatar-grad-${name.replace(/[^a-zA-Z0-9]/g, "")}`
  const arms = ARM_ANGLES[emotion]
  const mouthDepth = MOUTH_DEPTH[emotion]

  return (
    <svg viewBox="0 0 100 120" width={size} height={(size * 120) / 100} className={className} aria-label={name}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color.light} />
          <stop offset="55%" stopColor={color.base} />
          <stop offset="100%" stopColor={color.dark} />
        </linearGradient>
      </defs>

      {/* arms (behind body) */}
      <g transform={`rotate(${arms.left} 30 58)`}>
        <rect x={24} y={58} width={12} height={36} rx={6} fill={color.base} />
        <circle cx={30} cy={94} r={7} fill={color.light} />
      </g>
      <g transform={`rotate(${arms.right} 70 58)`}>
        <rect x={64} y={58} width={12} height={36} rx={6} fill={color.base} />
        <circle cx={70} cy={94} r={7} fill={color.light} />
      </g>

      {/* body */}
      <rect x={25} y={55} width={50} height={58} rx={25} fill={`url(#${gradId})`} />
      <ellipse cx={40} cy={68} rx={9} ry={14} fill="#ffffff" opacity={0.18} />

      {/* head */}
      <circle cx={50} cy={32} r={24} fill={`url(#${gradId})`} />
      <ellipse cx={42} cy={24} rx={7} ry={9} fill="#ffffff" opacity={0.25} />

      {/* face */}
      <circle cx={42} cy={32} r={2.6} fill="#1e293b" />
      <circle cx={58} cy={32} r={2.6} fill="#1e293b" />
      {emotion === "great" && (
        <>
          <circle cx={36} cy={40} r={3.5} fill="#f472b6" opacity={0.55} />
          <circle cx={64} cy={40} r={3.5} fill="#f472b6" opacity={0.55} />
        </>
      )}
      <path
        d={`M 40 40 Q 50 ${40 + mouthDepth} 60 40`}
        stroke="#1e293b"
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
