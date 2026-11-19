import { Fragment, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SimpleColumn {
  label: string
  /** Numbers line up on the right, names and labels on the left. */
  align?: "left" | "right"
  className?: string
}

export interface SimpleRow {
  key: string
  /** One cell per column. Keep to a number or a name; anything longer belongs in `detail`. */
  cells: ReactNode[]
  /** Everything else about the row. Hidden until the row is opened. */
  detail?: ReactNode
}

/**
 * A plain table for lists of people and numbers: a few narrow columns that fit a phone without side-scrolling, a row per
 * item, and the long text kept behind a toggle so a page reads as names and figures first.
 */
export function SimpleTable({ columns, rows, caption }: { columns: SimpleColumn[]; rows: SimpleRow[]; caption: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const hasDetail = rows.some((r) => r.detail)
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })

  return (
    <div className="glass-panel overflow-hidden rounded-2xl">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            {columns.map((c) => (
              <th key={c.label} scope="col" className={cn("px-3 py-2 font-semibold", c.align === "right" ? "text-right" : "text-left", c.className)}>
                {c.label}
              </th>
            ))}
            {hasDetail && <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">รายละเอียด</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open.has(r.key)
            return (
              <Fragment key={r.key}>
                <tr className="border-b border-border/60 last:border-b-0 hover:bg-primary/5">
                  {r.cells.map((cell, i) => (
                    <td
                      key={columns[i]?.label ?? i}
                      className={cn("px-3 py-2.5 align-top tabular-nums", columns[i]?.align === "right" ? "text-right" : "text-left", columns[i]?.className)}
                    >
                      {cell}
                    </td>
                  ))}
                  {hasDetail && (
                    <td className="w-10 px-2 py-2 align-top">
                      {r.detail && (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                          onClick={() => toggle(r.key)}
                          className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {isOpen && r.detail && (
                  <tr className="border-b border-border/60 bg-muted/40 last:border-b-0">
                    <td colSpan={columns.length + 1} className="px-3 py-3 text-xs">
                      {r.detail}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
