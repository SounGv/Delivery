import type { ComponentType, ReactNode } from "react"

/** Flip7 hero band that opens a menu / sub-menu page: teal gradient, an icon chip, an
 * extra-bold title, a one-line description and (optionally) gold info chips on the right.
 * The fanned translucent cards echo the Flip7 packaging logo. */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 via-brand-500 to-brand-400 p-5 text-white shadow-[0_8px_28px_rgba(43,168,162,0.30)]">
      <div className="pointer-events-none absolute -right-4 -top-6 hidden sm:block" aria-hidden>
        {[-24, -12, 0, 12, 24].map((deg, i) => (
          <span
            key={deg}
            className="absolute right-0 top-0 h-28 w-20 origin-bottom rounded-xl bg-white/10 ring-1 ring-white/20"
            style={{ transform: `translateX(${-i * 22}px) rotate(${deg}deg)` }}
          />
        ))}
      </div>
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
          <Icon className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-wide">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-white/85">{subtitle}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  )
}

/** Gold pill used for the small facts shown on a PageHeader (headcount, data date, ...). */
export function HeaderChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-gold px-3 py-1 text-xs font-extrabold text-[#5c4300] shadow-[0_4px_14px_rgba(255,210,63,0.45)]">
      {children}
    </span>
  )
}
