import { useState, type FormEvent, type ReactNode } from "react"
import { CheckCircle2, ClipboardList, PackageSearch, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  CLAIM_STATUS_LABEL,
  COURIERS,
  EMPTY_CLAIM_DRAFT,
  type ClaimDraft,
  type ClaimFieldErrors,
  type ClaimRecord,
  draftToRecord,
  findLocalClaim,
  upsertLocalClaim,
  validateClaimDraft,
} from "@/lib/claims"
import { submitRemoteClaim } from "@/api/claims"

const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </label>
  )
}

export function ClaimRegister() {
  const [tab, setTab] = useState<"register" | "status">("register")
  const [draft, setDraft] = useState<ClaimDraft>(EMPTY_CLAIM_DRAFT)
  const [errors, setErrors] = useState<ClaimFieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [saved, setSaved] = useState<ClaimRecord | null>(null)
  const [syncWarning, setSyncWarning] = useState("")
  const [lookupId, setLookupId] = useState("")
  const [lookupPhone, setLookupPhone] = useState("")
  const [lookupResult, setLookupResult] = useState<ClaimRecord | null | "missing">(null)

  const set = <K extends keyof ClaimDraft>(key: K, value: ClaimDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const nextErrors = validateClaimDraft(draft)
    setErrors(nextErrors)
    setSubmitError("")
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      const record = draftToRecord(draft)
      upsertLocalClaim(record)
      let warning = ""
      try {
        const remote = await submitRemoteClaim(record)
        if (remote === null) {
          warning = "บันทึกบนเครื่องนี้แล้ว — หากเปิดจากมือถือลูกค้า ทีมแอดมินจะเห็นรายการเมื่อเชื่อม Apps Script (แท็บเคลมสินค้า) แล้ว"
        }
      } catch {
        warning = "บันทึกบนเครื่องนี้แล้ว แต่ยังส่งเข้าชีทไม่สำเร็จ รบกวนแจ้งแอดมินหรือส่งรหัสเคลมทางแชทไว้ก่อน"
      }
      setSyncWarning(warning)
      setSaved(record)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่")
    } finally {
      setSubmitting(false)
    }
  }

  const handleLookup = (e: FormEvent) => {
    e.preventDefault()
    const found = findLocalClaim(lookupId, lookupPhone)
    setLookupResult(found ?? "missing")
  }

  if (saved) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="glass-panel rounded-3xl p-6 text-center sm:p-8">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-glow to-brand-500">
            <CheckCircle2 className="size-7 text-white" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">ลงทะเบียนสำเร็จ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            เขียนรหัสนี้ติดกล่องพัสดุ แล้วส่งเข้ามาได้เลย — ทีมรับเข้าจะเห็นข้อมูลโดยไม่ต้องพิมพ์ใหม่
          </p>
          <p className="mt-5 rounded-2xl border border-emerald-glow/30 bg-emerald-glow/10 px-4 py-4 font-mono text-2xl font-bold tracking-wide text-foreground">
            {saved.id}
          </p>
          <div className="mt-4 space-y-1 text-left text-sm text-muted-foreground">
            <p>
              <span className="text-foreground">เลขพัสดุ:</span> {saved.trackingNumber} ({saved.courier})
            </p>
            <p>
              <span className="text-foreground">ผู้ส่ง:</span> {saved.customerName} · {saved.phone}
            </p>
          </div>
          {syncWarning && (
            <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-600 dark:text-amber-400">
              {syncWarning}
            </p>
          )}
          <Button
            className="mt-6 w-full"
            size="lg"
            variant="outline"
            onClick={() => {
              setSaved(null)
              setDraft(EMPTY_CLAIM_DRAFT)
            }}
          >
            กรอกรายการใหม่
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <div className="mb-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-glow">
          <ClipboardList className="size-6 text-white" />
        </div>
        <h1 className="mt-3 text-xl font-semibold text-foreground">ลงทะเบียนส่งสินค้าเคลม</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          กรอกข้อมูลก่อนส่งพัสดุเข้ามา เพื่อลดงานพิมพ์ของทีมแอดมินรับเข้า
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setTab("register")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium",
            tab === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          กรอกข้อมูลเคลม
        </button>
        <button
          type="button"
          onClick={() => setTab("status")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium",
            tab === "status" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          ตรวจสอบรหัสเคลม
        </button>
      </div>

      {tab === "status" ? (
        <form onSubmit={handleLookup} className="glass-panel space-y-4 rounded-3xl p-5 sm:p-6">
          <p className="text-sm text-muted-foreground">ใส่รหัสเคลมและเบอร์โทรที่ใช้ลงทะเบียน เพื่อดูสถานะ</p>
          <Field label="รหัสเคลม" required>
            <input
              className={inputClass}
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="CLM-260813-XXXX"
              autoCapitalize="characters"
            />
          </Field>
          <Field label="เบอร์โทร" required>
            <input
              className={inputClass}
              value={lookupPhone}
              onChange={(e) => setLookupPhone(e.target.value)}
              placeholder="08xxxxxxxx"
              inputMode="tel"
            />
          </Field>
          <Button type="submit" className="w-full" size="lg">
            <PackageSearch className="size-4" /> ตรวจสอบ
          </Button>
          {lookupResult === "missing" && (
            <p className="text-center text-sm text-destructive">ไม่พบรายการนี้บนเครื่องนี้ — ตรวจรหัส/เบอร์ หรือถามแอดมินที่ส่งลิงก์ให้</p>
          )}
          {lookupResult && lookupResult !== "missing" && (
            <div className="rounded-2xl border border-border bg-background/50 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono font-semibold text-foreground">{lookupResult.id}</p>
                <Badge variant="outline">{CLAIM_STATUS_LABEL[lookupResult.status]}</Badge>
              </div>
              <p className="mt-2 text-muted-foreground">
                {lookupResult.customerName} · {lookupResult.trackingNumber}
              </p>
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="glass-panel space-y-3 rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground">1. ข้อมูลผู้ส่งเคลม</h2>
            <Field label="ชื่อ-นามสกุล" required error={errors.customerName}>
              <input
                className={inputClass}
                value={draft.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                placeholder="ชื่อที่ใช้ติดต่อรับพัสดุ"
                autoComplete="name"
              />
            </Field>
            <Field label="เบอร์โทร" required error={errors.phone}>
              <input
                className={inputClass}
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="08xxxxxxxx"
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
            <Field label="ที่อยู่ตามพัสดุที่ส่งเข้ามา" required error={errors.senderAddress}>
              <textarea
                className={cn(inputClass, "min-h-24 resize-y")}
                value={draft.senderAddress}
                onChange={(e) => set("senderAddress", e.target.value)}
                placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
              />
            </Field>
          </section>

          <section className="glass-panel space-y-3 rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground">2. พัสดุที่ส่งเข้ามา</h2>
            <Field label="เลขพัสดุ (Tracking)" required error={errors.trackingNumber}>
              <input
                className={inputClass}
                value={draft.trackingNumber}
                onChange={(e) => set("trackingNumber", e.target.value)}
                placeholder="เช่น KEX123456789TH"
                autoCapitalize="characters"
              />
            </Field>
            <Field label="บริษัทขนส่ง" required error={errors.courier}>
              <select
                className={inputClass}
                value={draft.courier}
                onChange={(e) => set("courier", e.target.value)}
              >
                <option value="" className="bg-popover text-popover-foreground">
                  เลือกขนส่ง
                </option>
                {COURIERS.map((c) => (
                  <option key={c} value={c} className="bg-popover text-popover-foreground">
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          <section className="glass-panel space-y-3 rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground">3. ที่อยู่ส่งกลับหลังเคลม/ซ่อม</h2>
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-brand-500"
                checked={draft.sameAsSender}
                onChange={(e) => set("sameAsSender", e.target.checked)}
              />
              ใช้ชื่อ เบอร์ และที่อยู่เดียวกับผู้ส่ง
            </label>
            {!draft.sameAsSender && (
              <>
                <Field label="ชื่อผู้รับของส่งกลับ" required error={errors.returnName}>
                  <input
                    className={inputClass}
                    value={draft.returnName}
                    onChange={(e) => set("returnName", e.target.value)}
                    placeholder="ชื่อผู้รับพัสดุคืน"
                  />
                </Field>
                <Field label="เบอร์โทรผู้รับ" required error={errors.returnPhone}>
                  <input
                    className={inputClass}
                    value={draft.returnPhone}
                    onChange={(e) => set("returnPhone", e.target.value)}
                    placeholder="08xxxxxxxx"
                    inputMode="tel"
                  />
                </Field>
                <Field label="ที่อยู่จัดส่งกลับ" required error={errors.returnAddress}>
                  <textarea
                    className={cn(inputClass, "min-h-24 resize-y")}
                    value={draft.returnAddress}
                    onChange={(e) => set("returnAddress", e.target.value)}
                    placeholder="ที่อยู่ที่ต้องการให้ส่งสินค้ากลับ"
                  />
                </Field>
              </>
            )}
          </section>

          <section className="glass-panel space-y-3 rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground">4. ข้อมูลสินค้า (ถ้ามี)</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="ยี่ห้อ">
                <input className={inputClass} value={draft.brand} onChange={(e) => set("brand", e.target.value)} />
              </Field>
              <Field label="รุ่น">
                <input className={inputClass} value={draft.model} onChange={(e) => set("model", e.target.value)} />
              </Field>
            </div>
            <Field label="Serial Number">
              <input
                className={inputClass}
                value={draft.serialNumber}
                onChange={(e) => set("serialNumber", e.target.value)}
                autoCapitalize="characters"
              />
            </Field>
            <Field label="เลขที่ออเดอร์ / ใบเสร็จ">
              <input className={inputClass} value={draft.orderRef} onChange={(e) => set("orderRef", e.target.value)} />
            </Field>
            <Field label="อาการเสีย / เหตุผลที่ส่งเคลม">
              <textarea
                className={cn(inputClass, "min-h-20 resize-y")}
                value={draft.issue}
                onChange={(e) => set("issue", e.target.value)}
                placeholder="เช่น เปิดไม่ติด, จอแตก, ส่งผิดรุ่น"
              />
            </Field>
          </section>

          {submitError && <p className="text-center text-sm text-destructive">{submitError}</p>}

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            <ShieldCheck className="size-4" />
            {submitting ? "กำลังบันทึก..." : "ยืนยันลงทะเบียนเคลม"}
          </Button>
          <p className="pb-6 text-center text-[11px] text-muted-foreground">
            ข้อมูลใช้สำหรับรับเข้าพัสดุเคลมและจัดส่งกลับเท่านั้น
          </p>
        </form>
      )}
    </div>
  )
}
