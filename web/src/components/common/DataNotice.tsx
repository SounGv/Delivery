import { AlertTriangle } from "lucide-react"

/**
 * The notice shown when a page has no data to show (the sheet could not be read, the tab is missing, or
 * nobody has filled it in yet). Written for the people who use the dashboard: what is missing and what to do
 * about it first; the technical reason goes on a small last line for whoever looks after the system.
 */
export function DataNotice({ title, body, detail }: { title: string; body?: string; detail?: string }) {
  return (
    <div role="status" className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
      <div className="text-sm">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {body ?? "ลองรีเฟรชหน้านี้อีกครั้ง ถ้ายังไม่ขึ้นให้แจ้งผู้ดูแลระบบ"}
        </p>
        {detail && <p className="mt-1 text-[11px] text-muted-foreground/80">รายละเอียดสำหรับผู้ดูแลระบบ: {detail}</p>}
      </div>
    </div>
  )
}
