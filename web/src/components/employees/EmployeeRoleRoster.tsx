import { ClipboardList } from "lucide-react"
import { EMPLOYEE_ROLE_GROUPS } from "@/lib/employeeRoles"

/** ฝ่ายออฟไลน์'s roster — main duty and which target-calculation mode applies to
 * each name, exactly as given by ops (see EMPLOYEE_ROLES's module doc). Read-only:
 * roles are static business facts, not something the dashboard derives or edits. */
export function EmployeeRoleRoster() {
  return (
    <div className="glass-panel overflow-x-auto rounded-2xl p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <ClipboardList className="size-4" /> รายชื่อพนักงานฝ่ายออฟไลน์ — หน้าที่หลัก และรูปแบบคำนวณเป้า
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        ฝ่ายออฟไลน์เป็นขายส่ง บางคนหน้าที่หลักไม่ใช่จัดออเดอร์ (CN คืนสินค้า / สแกนจัดส่ง / กระจายพัสดุ) จึงไม่นับเป้าพัสดุเป็น KPI หลัก — ยังคงแสดงยอดพัสดุ/สินค้าจริงตามปกติ
      </p>
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="pb-2 font-medium">พนักงาน</th>
            <th className="pb-2 font-medium">หน้าที่งานหลัก</th>
            <th className="pb-2 font-medium">รูปแบบคำนวณเป้า</th>
          </tr>
        </thead>
        <tbody>
          {EMPLOYEE_ROLE_GROUPS.map((g) => (
            <tr key={g.role} className="border-b border-white/5 last:border-0 align-top">
              <td className="py-2 text-foreground">{g.names.join(", ")}</td>
              <td className="py-2 text-muted-foreground">{g.role}</td>
              <td className="py-2">
                <span
                  className={
                    g.excludedFromParcelTarget
                      ? "inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500"
                      : "inline-flex items-center rounded-full bg-emerald-glow/15 px-2 py-0.5 text-xs font-medium text-emerald-glow"
                  }
                >
                  {g.excludedFromParcelTarget ? "ไม่นับเป้าพัสดุเป็นหลัก" : "นับเป้าพัสดุปกติ"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
