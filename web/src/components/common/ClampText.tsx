import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/** A caption that is cut to two lines on a phone, with a "ดูเพิ่ม" / "ย่อ" button when there is more to read.
 * From the sm breakpoint up it shows in full, as before. */
export function ClampText({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      // Only a phone clamps; measuring while open would always report "not cut", so keep the last answer then.
      if (open) return
      setCut(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open, children])

  return (
    <div>
      <p ref={ref} className={cn(className, !open && "max-sm:line-clamp-2")}>
        {children}
      </p>
      {(cut || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="-my-3 flex h-11 items-center text-xs font-bold text-primary sm:hidden"
        >
          {open ? "ย่อ" : "ดูเพิ่ม"}
        </button>
      )}
    </div>
  )
}
