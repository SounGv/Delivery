import { OT_TYPE_LABEL, type OtRecord } from "@/lib/ot"
import { formatFullDateLabel } from "@/lib/format"

interface OtSlipProps {
  record: OtRecord
  companyName: string
  logoDataUrl: string | null
  /** Deterministic document number derived from the record (date + name). */
  docNo: string
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-b border-black/20 py-1.5">
      <span className="w-40 shrink-0 text-black/60">{label}</span>
      <span className="font-medium text-black">{value}</span>
    </div>
  )
}

/** A4 OT authorization slip. Rendered inside the print modal; the `ot-slip`
 * class is what the print stylesheet isolates. Uses only real computed values. */
export function OtSlip({ record, companyName, logoDataUrl, docNo }: OtSlipProps) {
  return (
    <div className="ot-slip mx-auto w-[210mm] max-w-full bg-white p-10 text-sm text-black">
      <div className="flex items-center gap-4 border-b-2 border-black pb-4">
        {logoDataUrl ? (
          <img src={logoDataUrl} alt="logo" className="size-16 rounded object-contain" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded bg-black/5 text-xs text-black/40">LOGO</div>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold">{companyName}</h1>
          <p className="text-black/60">แบบฟอร์มขอทำงานล่วงเวลา (OT Request Form)</p>
        </div>
        <div className="text-right text-xs">
          <p className="text-black/60">เลขที่เอกสาร</p>
          <p className="font-semibold">{docNo}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-8">
        <Field label="ชื่อพนักงาน" value={record.employeeName} />
        <Field label="แผนก" value={record.department} />
        <Field label="วันที่" value={formatFullDateLabel(record.date)} />
        <Field label="ประเภทวัน" value={record.workStatus} />
        <Field label="เวลาเริ่ม (เข้างาน)" value={record.checkIn ?? "-"} />
        <Field label="เวลาเลิก (ออกงาน)" value={record.checkOut ?? "-"} />
        <Field label="ประเภท OT" value={OT_TYPE_LABEL[record.otType]} />
        <Field label="จำนวนชั่วโมง OT" value={`${record.otHours.toFixed(2)} ชั่วโมง`} />
      </div>

      <div className="mt-4">
        <p className="text-black/60">งานที่ทำ / รายละเอียด</p>
        <div className="mt-1 min-h-[48px] border-b border-black/20">
          {record.parcels != null || record.items != null
            ? `ยอดงานวันดังกล่าว: ${record.parcels ?? 0} พัสดุ · ${record.items ?? 0} ชิ้น`
            : ""}
        </div>
      </div>

      <div className="mt-16 grid grid-cols-3 gap-8 text-center text-xs">
        {["พนักงาน", "หัวหน้างาน", "ผู้อนุมัติ"].map((role) => (
          <div key={role}>
            <div className="border-t border-black pt-1">ลงชื่อ ..................................</div>
            <p className="mt-1 text-black/60">({role})</p>
          </div>
        ))}
      </div>

      <p className="mt-8 text-[10px] text-black/40">
        เอกสารนี้สร้างจากข้อมูลเวลาเข้า-ออกงานจริงในระบบ · ค่า OT คำนวณจากอัตราที่ตั้งไว้ใน Settings · โปรดตรวจสอบก่อนอนุมัติ
      </p>
    </div>
  )
}
