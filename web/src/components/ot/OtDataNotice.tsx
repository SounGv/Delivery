import { Info } from "lucide-react"

/** Shown on OT pages when the dataset carries no check-in/out times yet — i.e.
 * the Apps Script that reads the sheet hasn't been redeployed with the
 * time-column support. Honest guidance instead of empty/zero screens. */
export function OtDataNotice() {
  return (
    <div className="glass-panel flex items-start gap-3 rounded-2xl border-amber-500/30 p-4">
      <Info className="mt-0.5 size-5 shrink-0 text-amber-500" />
      <div className="text-sm">
        <p className="font-semibold text-foreground">ยังไม่พบข้อมูลเวลาเข้า-ออกงานจากชีท</p>
        <p className="mt-1 text-xs text-muted-foreground">
          ระบบ OT อ่านคอลัมน์ <b>เวลาเข้างาน / เวลาออกงาน</b> จากชีตโดยตรง แต่ตอนนี้ยังไม่พบข้อมูลเวลา
          {" "}เมื่อทีมกรอกเวลาเข้า-ออกแล้ว หน้านี้จะแสดง OT จริงทันทีที่มีเวลาออกงานเกินเวลาเลิกงานปกติ
          {" "}ถ้ากรอกแล้วแต่ยังไม่ขึ้น ลองรีเฟรชหน้านี้หรือแจ้งผู้ดูแลระบบ
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          รายละเอียดสำหรับผู้ดูแลระบบ: API ยังไม่ส่งคอลัมน์เวลามา (ต้องอัปเดต/deploy Apps Script เวอร์ชันที่อ่านคอลัมน์เวลา)
        </p>
      </div>
    </div>
  )
}
