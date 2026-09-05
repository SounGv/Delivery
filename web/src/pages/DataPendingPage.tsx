import { Database } from "lucide-react"

interface DataPendingPageProps {
  title: string
  /** Plain-language description of what this page will do. */
  purpose: string
  /** The exact sheet data still needed before it can show real numbers. */
  needs: string[]
}

/** Honest placeholder for menu items whose source data isn't in the connected
 * Google Sheet yet. Deliberately shows NO fabricated numbers — only what data
 * would need to be added, per the "no mock data" requirement. */
export function DataPendingPage({ title, purpose, needs }: DataPendingPageProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="glass-panel max-w-lg rounded-2xl p-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-glow">
          <Database className="size-7 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{purpose}</p>
        <div className="mt-5 rounded-xl border border-border bg-white/5 p-4 text-left">
          <p className="text-xs font-semibold text-foreground">ต้องมีข้อมูลนี้ในชีทก่อน (ยังไม่พบใน Google Sheets ที่เชื่อมอยู่):</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {needs.map((n) => (
              <li key={n} className="flex gap-2">
                <span className="text-brand-400">•</span>
                {n}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          เมื่อเพิ่มข้อมูลในชีทและอัปเดต Apps Script (mapping layer) แล้ว หน้านี้จะคำนวณและแสดงผลจากข้อมูลจริงทันที — ไม่มีการใส่ข้อมูลจำลอง
        </p>
      </div>
    </div>
  )
}

export const WorkSchedulePage = () => (
  <DataPendingPage
    title="Work Schedule"
    purpose="ตารางเวร/วันทำงานรายบุคคล เพื่อระบุว่าใครเข้าเวรวันไหน วันหยุด วันลา — และเพื่อให้ระบบแยก OT วันทำงาน กับ OT วันหยุดได้ถูกต้อง"
    needs={[
      "สถานะวันต่อคน: WORK / DAY_OFF / HOLIDAY / LEAVE (คนละแท็บกับยอดผลิต)",
      "วันที่ + ชื่อพนักงาน ที่ตรงกับชื่อในหน้ายอดผลิต",
    ]}
  />
)

export const LeavePage = () => (
  <DataPendingPage
    title="Leave"
    purpose="บันทึกและสรุปการลาของพนักงาน (ลาป่วย/ลากิจ/ลาพักร้อน)"
    needs={["ตารางการลา: วันที่, ชื่อพนักงาน, ประเภทการลา, จำนวนวัน"]}
  />
)

export const LeaveReportPage = () => (
  <DataPendingPage
    title="Leave Report"
    purpose="รายงานสรุปการลาแยกตามพนักงาน/ประเภท/ช่วงเวลา"
    needs={["ตารางการลา (เหมือนหน้า Leave) — วันที่, ชื่อ, ประเภทการลา, จำนวนวัน"]}
  />
)

export const AttendanceReportPage = () => (
  <DataPendingPage
    title="Attendance Report"
    purpose="รายงานสรุปการเข้างาน มาสาย ขาด ลา แยกตามพนักงาน/เดือน"
    needs={[
      "เวลาเข้า-ออกงานครบทุกวัน (ตอนนี้มีเฉพาะบางวันที่กรอกไว้)",
      "สถานะวัน WORK/DAY_OFF/LEAVE ต่อคน เพื่อแยก 'ขาด' ออกจาก 'วันหยุด'",
    ]}
  />
)
