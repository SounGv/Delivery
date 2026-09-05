/**
 * Static per-employee job responsibility, given directly by the ops team —
 * not derived from the Sheet (it has no "role" column). Exact-name lookup
 * only: sheet nicknames occasionally differ from how a name is written here
 * (e.g. "บัค" vs "บุ๊ค"), and guessing a fuzzy match risks attributing one
 * person's role to a different person, so an unmatched name just falls back
 * to "no data" rather than a guess.
 */
export const EMPLOYEE_ROLES: Record<string, string> = {
  ภัท: "จัดออเดอร์ หาของ แพ็ค",
  ตูน: "จัดออเดอร์ หาของ แพ็ค",
  หวาน: "จัดออเดอร์ หาของ แพ็ค",
  เอ๋ย: "จัดออเดอร์ หาของ แพ็ค",
  แคท: "จัดออเดอร์ หาของ แพ็ค",
  ตอม: "จัดออเดอร์ หาของ แพ็ค",
  ยู: "จัดออเดอร์ หาของ แพ็ค",
  นุช: "จัดออเดอร์ หาของ แพ็ค",
  บุ๊ค:
    "ทำหน้าที่สแกนจัดส่ง และเคียร์สินค้าที่แพ็คในห้องออนไลน์ส่งเข้าเลิฟเตรียมจัดส่ง ว่างก็จะช่วยหาสินค้า",
  เอิร์ท:
    "ทำหน้าที่สแกนจัดส่ง และเคียร์สินค้าที่แพ็คในห้องออนไลน์ส่งเข้าเลิฟเตรียมจัดส่ง ว่างก็จะช่วยหาสินค้า",
  บาส: "ทำหน้าที่กระจายพัสดุที่หน้าบ้านให้กับไรเดอร์ที่มารับ (งานฝ่ายออฟไลน์)",
  ปู: "จัดออเดอร์",
  น็อต: "จัดออเดอร์",
  ใหม่: "จัดออเดอร์",
  โอ้: "จัดออเดอร์",
  เฟิร์น: "หน้าที่หลักทำสินค้ารับคืน (CN) งานไม่มีไปช่วยหาสินค้า หยิบสินค้า",
  พั้น: "หน้าที่หลักทำสินค้ารับคืน (CN) งานไม่มีไปช่วยหาสินค้า หยิบสินค้า",
  อ้อ: "หน้าที่หลักทำสินค้ารับคืน (CN) งานไม่มีไปช่วยหาสินค้า หยิบสินค้า",
}

export function getEmployeeRole(name: string | null | undefined): string | null {
  if (!name) return null
  return EMPLOYEE_ROLES[name.trim()] ?? null
}

/**
 * Employees whose primary duty is something other than parcel fulfillment
 * (CN returns, scan/ship staging, rider hand-off) and who only pick up parcel
 * work when their own queue is empty. Per ops: the parcel target must never be
 * scored as their PRIMARY KPI — they still show their real parcel/item counts,
 * just without a target/status judged against those counts.
 */
const NO_PRIMARY_PARCEL_TARGET = new Set(["เฟิร์น", "พั้น", "อ้อ", "บุ๊ค", "เอิร์ท", "บาส"])

export function hasNoPrimaryParcelTarget(name: string | null | undefined): boolean {
  if (!name) return false
  return NO_PRIMARY_PARCEL_TARGET.has(name.trim())
}

export interface EmployeeRoleGroup {
  role: string
  names: string[]
  /** Target-calculation mode for everyone in this group — see hasNoPrimaryParcelTarget. */
  excludedFromParcelTarget: boolean
}

/**
 * EMPLOYEE_ROLES collapsed into one row per distinct role text, in first-appearance
 * order — every name here is ฝ่ายออฟไลน์ (given directly by ops, see the module doc
 * above), so this is the roster for the offline team's dashboard view.
 */
export const EMPLOYEE_ROLE_GROUPS: EmployeeRoleGroup[] = (() => {
  const order: string[] = []
  const byRole = new Map<string, string[]>()
  for (const [name, role] of Object.entries(EMPLOYEE_ROLES)) {
    const names = byRole.get(role)
    if (names) {
      names.push(name)
    } else {
      byRole.set(role, [name])
      order.push(role)
    }
  }
  return order.map((role) => {
    const names = byRole.get(role)!
    return { role, names, excludedFromParcelTarget: hasNoPrimaryParcelTarget(names[0]) }
  })
})()
