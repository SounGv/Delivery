import { Download } from "lucide-react"
import { downloadCsv } from "@/lib/csv"
import type { ExportTable } from "@/lib/reportExports"
import { cn } from "@/lib/utils"

/** Flip7 pill "ส่งออกรายงาน" button. Builds the table lazily on click (so a 5,000-row
 * report isn't assembled on every render) and saves it as a UTF-8 CSV that opens in Excel. */
export function ExportButton({
  build,
  disabled,
  label = "ส่งออกรายงาน",
  className,
}: {
  build: () => ExportTable
  disabled?: boolean
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        const table = build()
        downloadCsv(table.filename, table.headers, table.rows)
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground shadow-[0_4px_14px_rgba(43,168,162,0.15)] transition-all hover:-translate-y-0.5 hover:bg-muted active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        className
      )}
    >
      <Download className="size-4 text-primary" /> {label}
    </button>
  )
}
