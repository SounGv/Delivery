import { useRef, useState } from "react"
import { Moon, Sun, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/lib/theme"
import { useSettings } from "@/lib/settingsContext"
import { getApiUrlOverride, getRefreshIntervalMs, setApiUrlOverride, setRefreshIntervalMs } from "@/lib/settingsStorage"
import { cn } from "@/lib/utils"

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

const REFRESH_OPTIONS = [
  { ms: 5000, label: "5 วินาที" },
  { ms: 10000, label: "10 วินาที" },
  { ms: 30000, label: "30 วินาที" },
  { ms: 60000, label: "1 นาที" },
]

export function Settings() {
  const { theme, toggleTheme } = useTheme()
  const {
    targetOverride,
    setTargetOverride,
    offlineOrderTarget,
    setOfflineOrderTarget,
    logoDataUrl,
    setLogoDataUrl,
    workStartHour,
    setWorkStartHour,
    workEndHour,
    setWorkEndHour,
    lunchStartHour,
    setLunchStartHour,
    lunchEndHour,
    setLunchEndHour,
    department,
    setDepartment,
    companyName,
    setCompanyName,
    dailyTarget,
    setDailyTarget,
    attendanceStartDate,
    setAttendanceStartDate,
  } = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [urlInput, setUrlInput] = useState(() => getApiUrlOverride() ?? import.meta.env.VITE_APPS_SCRIPT_URL ?? "")
  const [refreshMs, setRefreshMsState] = useState(() => getRefreshIntervalMs())
  const [targetInput, setTargetInput] = useState(() => (targetOverride ? String(targetOverride) : ""))
  const [offlineOrderTargetInput, setOfflineOrderTargetInput] = useState(() =>
    offlineOrderTarget ? String(offlineOrderTarget) : ""
  )
  const [saved, setSaved] = useState(false)

  const handleSaveUrl = () => {
    setApiUrlOverride(urlInput.trim() || null)
    setSaved(true)
    window.location.reload()
  }

  const handleResetUrl = () => {
    setApiUrlOverride(null)
    setUrlInput(import.meta.env.VITE_APPS_SCRIPT_URL ?? "")
    window.location.reload()
  }

  const handleRefreshChange = (ms: number) => {
    setRefreshMsState(ms)
    setRefreshIntervalMs(ms)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogoDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSaveTarget = () => {
    const n = Number(targetInput)
    setTargetOverride(Number.isFinite(n) && n > 0 ? n : null)
  }

  const handleSaveOfflineOrderTarget = () => {
    const n = Number(offlineOrderTargetInput)
    setOfflineOrderTarget(Number.isFinite(n) && n > 0 ? n : null)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SettingsSection title="Google Apps Script URL" description="ที่อยู่ Web App ที่ deploy ไว้บนชีทของทีม">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://script.google.com/macros/s/XXXX/exec"
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleSaveUrl}>บันทึกและโหลดใหม่</Button>
          <Button size="sm" variant="outline" onClick={handleResetUrl}>ใช้ค่าเริ่มต้น (.env)</Button>
        </div>
        {saved && <p className="mt-2 text-xs text-emerald-glow">บันทึกแล้ว กำลังโหลดหน้าใหม่...</p>}
      </SettingsSection>

      <SettingsSection title="Refresh Interval" description="ความถี่ในการดึงข้อมูลใหม่จาก Google Sheets">
        <div className="flex flex-wrap gap-2">
          {REFRESH_OPTIONS.map((opt) => (
            <button
              key={opt.ms}
              type="button"
              onClick={() => handleRefreshChange(opt.ms)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                refreshMs === opt.ms
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Theme" description="โหมดสีของแดชบอร์ด">
        <div className="flex gap-2">
          <Button size="sm" variant={theme === "dark" ? "default" : "outline"} onClick={() => theme !== "dark" && toggleTheme()}>
            <Moon className="size-4" /> Dark
          </Button>
          <Button size="sm" variant={theme === "light" ? "default" : "outline"} onClick={() => theme !== "light" && toggleTheme()}>
            <Sun className="size-4" /> Light
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Company Logo" description="แสดงแทนไอคอนคลังในแถบเมนูด้านซ้าย">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center overflow-hidden rounded-xl border border-border bg-white/5">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="Logo preview" className="size-full object-cover" />
            ) : (
              <span className="text-[10px] text-muted-foreground">ไม่มีโลโก้</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" /> อัปโหลด
            </Button>
            {logoDataUrl && (
              <Button size="sm" variant="ghost" onClick={() => setLogoDataUrl(null)}>
                <X className="size-4" /> ลบ
              </Button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
        </div>
      </SettingsSection>

      <SettingsSection title="Target KPI" description="กำหนดเป้าจำนวนสินค้าต่อคนเอง แทนค่าจากชีท (ค่าปัจจุบันในชีทจะยังแสดงถ้าไม่ตั้งค่านี้)">
        <div className="flex gap-2">
          <input
            type="number"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            placeholder="เช่น 350"
            className="w-32 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <Button size="sm" onClick={handleSaveTarget}>บันทึก</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTargetInput("")
              setTargetOverride(null)
            }}
          >
            ใช้ค่าจากชีท
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Target ออเดอร์ (ฝ่ายออฟไลน์)"
        description="ฝ่ายออฟไลน์เป็นขายส่ง วัดผลด้วยจำนวนออเดอร์ต่อคนต่อวัน แยกจากเป้าพัสดุของฝ่ายออนไลน์ — ใช้คำนวณจำนวนคนที่ควรใช้ในหน้าผลงานของฝ่ายออฟไลน์เท่านั้น"
      >
        <div className="flex gap-2">
          <input
            type="number"
            value={offlineOrderTargetInput}
            onChange={(e) => setOfflineOrderTargetInput(e.target.value)}
            placeholder="เช่น 40"
            className="w-32 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <Button size="sm" onClick={handleSaveOfflineOrderTarget}>บันทึก</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setOfflineOrderTargetInput("")
              setOfflineOrderTarget(null)
            }}
          >
            ล้างค่า
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="ตั้งค่าเวลาทำงาน / OT" description="ใช้คำนวณ OT และชั่วโมงทำงานสุทธิจากเวลาเข้า-ออกจริงในชีท (ไม่คำนวณเป็นเงิน) — เป็นค่านโยบายบริษัท ไม่ใช่ข้อมูลรายวันในชีท">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-[11px] text-muted-foreground">เข้างานปกติ (ชม.)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={workStartHour}
              onChange={(e) => setWorkStartHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground">เลิกงานปกติ (ชม.)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={workEndHour}
              onChange={(e) => setWorkEndHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground">พักเที่ยงเริ่ม (ชม.)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={lunchStartHour}
              onChange={(e) => setLunchStartHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground">พักเที่ยงเลิก (ชม.)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={lunchEndHour}
              onChange={(e) => setLunchEndHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          ทำงานเลย {workEndHour}:00 ในวันทำงาน = OT · เข้าก่อนเวลา (เช่น 8:30 ทำส่งด่วน) นับเป็นชั่วโมงทำงาน แต่ไม่นับเป็น OT · ชั่วโมงทำงานสุทธิหักพักเที่ยง {lunchStartHour}:00–{lunchEndHour}:00
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] text-muted-foreground">เป้าพัสดุ/วัน (เต็มเวลา)</label>
            <input
              type="number"
              min={0}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground">เริ่มบันทึกเวลาเข้า-ออก (วันที่)</label>
            <input
              type="date"
              value={attendanceStartDate}
              onChange={(e) => setAttendanceStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          เป้าหมายจะปรับตามชั่วโมงทำงานจริง (Dynamic Target) · ข้อมูลก่อนวันเริ่มบันทึกจะไม่ถูกนำมาคำนวณเวลา/OT
        </p>
      </SettingsSection>

      <SettingsSection title="ข้อมูลบนใบ OT" description="แสดงบนหัวใบขอทำงานล่วงเวลาตอนพิมพ์">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] text-muted-foreground">ชื่อบริษัท / ทีม</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground">แผนก</label>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
