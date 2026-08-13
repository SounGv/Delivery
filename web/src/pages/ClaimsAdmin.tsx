import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  ClipboardCopy,
  Download,
  Link2,
  MessageSquare,
  PackageCheck,
  PackageOpen,
  Search,
  Send,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/kpi/KpiCard"
import { cn } from "@/lib/utils"
import { downloadCsv } from "@/lib/csv"
import { formatDateTime } from "@/lib/format"
import {
  CLAIM_STATUS_LABEL,
  CLAIM_STATUSES,
  type ClaimRecord,
  type ClaimStatus,
  customerClaimLink,
  customerInviteMessage,
  formatClaimClipboard,
  isSameLocalDay,
  loadLocalClaims,
  matchesClaimQuery,
  mergeClaimLists,
  upsertLocalClaim,
} from "@/lib/claims"
import { fetchRemoteClaims, updateRemoteClaimStatus } from "@/api/claims"

function statusClass(status: ClaimStatus): string {
  if (status === "pending_parcel") return "border-amber-500/40 text-amber-500"
  if (status === "received") return "border-brand-500/40 text-brand-400"
  if (status === "in_progress") return "border-violet-500/40 text-violet-400"
  if (status === "returned") return "border-emerald-glow/40 text-emerald-glow"
  return "border-destructive/40 text-destructive"
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ClaimsAdmin() {
  const [claims, setClaims] = useState<ClaimRecord[]>(() => loadLocalClaims())
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | ClaimStatus>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState<"link" | "invite" | "row" | null>(null)
  const [remoteNote, setRemoteNote] = useState("")
  const [adminNoteDraft, setAdminNoteDraft] = useState("")

  const refresh = useCallback(async () => {
    const local = loadLocalClaims()
    setClaims(local)
    try {
      const remote = await fetchRemoteClaims()
      if (remote) {
        const merged = mergeClaimLists(local, remote)
        merged.forEach((c) => upsertLocalClaim(c))
        setClaims(mergeClaimLists(loadLocalClaims()))
        setRemoteNote("")
      }
    } catch (err) {
      setRemoteNote(err instanceof Error ? err.message : "ซิงก์ชีทไม่สำเร็จ — ใช้ข้อมูลในเครื่องนี้")
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = claims.find((c) => c.id === selectedId) ?? null
  useEffect(() => {
    setAdminNoteDraft(selected?.adminNote ?? "")
  }, [selected?.id, selected?.adminNote])

  const filtered = useMemo(() => {
    return claims.filter((c) => (status === "all" || c.status === status) && matchesClaimQuery(c, query))
  }, [claims, query, status])

  const todayCount = claims.filter((c) => isSameLocalDay(c.createdAt)).length
  const pendingCount = claims.filter((c) => c.status === "pending_parcel").length
  const receivedToday = claims.filter((c) => c.receivedAt && isSameLocalDay(c.receivedAt)).length

  const markCopied = (key: "link" | "invite" | "row") => {
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1600)
  }

  const handleCopyLink = async () => {
    if (await copyText(customerClaimLink())) markCopied("link")
  }

  const handleCopyInvite = async () => {
    if (await copyText(customerInviteMessage(customerClaimLink()))) markCopied("invite")
  }

  const handleCopyRow = async (claim: ClaimRecord) => {
    if (await copyText(formatClaimClipboard(claim))) markCopied("row")
  }

  const handleStatus = async (claim: ClaimRecord, next: ClaimStatus) => {
    const updated: ClaimRecord = {
      ...claim,
      status: next,
      updatedAt: new Date().toISOString(),
      receivedAt: next === "received" ? new Date().toISOString() : claim.receivedAt,
      adminNote: adminNoteDraft.trim() || claim.adminNote,
    }
    const list = upsertLocalClaim(updated)
    setClaims(list)
    setSelectedId(updated.id)
    try {
      await updateRemoteClaimStatus(updated.id, next, updated.adminNote)
    } catch {
      // local update is enough until the sheet endpoint is live
    }
  }

  const handleExport = () => {
    downloadCsv(
      `claims_${status}.csv`,
      [
        "รหัสเคลม",
        "วันเวลา",
        "สถานะ",
        "ชื่อ",
        "เบอร์โทร",
        "ที่อยู่ผู้ส่ง",
        "เลขพัสดุ",
        "ขนส่ง",
        "ผู้รับคืน",
        "เบอร์คืน",
        "ที่อยู่ส่งกลับ",
        "ยี่ห้อ",
        "รุ่น",
        "Serial",
        "ออเดอร์",
        "อาการ",
        "หมายเหตุแอดมิน",
      ],
      filtered.map((c) => [
        c.id,
        c.createdAt,
        CLAIM_STATUS_LABEL[c.status],
        c.customerName,
        c.phone,
        c.senderAddress,
        c.trackingNumber,
        c.courier,
        c.returnName,
        c.returnPhone,
        c.returnAddress,
        c.brand,
        c.model,
        c.serialNumber,
        c.orderRef,
        c.issue,
        c.adminNote,
      ])
    )
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">ลงทะเบียนเคลมก่อนส่งพัสดุ</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
              ส่งลิงก์ให้ลูกค้ากรอกชื่อ ที่อยู่ เบอร์โทร เลขพัสดุ และที่อยู่ส่งกลับ — เมื่อพัสดุถึง ค้นหาเลขพัสดุแล้วคัดลอกข้อมูลได้ทันที ไม่ต้องพิมพ์ใหม่
              Redeploy Apps Script หลังอัปเดตนี้ เพื่อให้รายการจากมือถือลูกค้าเข้าแท็บชีท &quot;เคลมสินค้า&quot; และโชว์ที่นี่ทุกเครื่อง
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void handleCopyLink()}>
              {copied === "link" ? <Check className="size-4" /> : <Link2 className="size-4" />}
              {copied === "link" ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์ลูกค้า"}
            </Button>
            <Button variant="outline" onClick={() => window.open(customerClaimLink(), "_blank", "noopener,noreferrer")}>
              เปิดฟอร์มลูกค้า
            </Button>
            <Button onClick={() => void handleCopyInvite()}>
              {copied === "invite" ? <Check className="size-4" /> : <MessageSquare className="size-4" />}
              {copied === "invite" ? "คัดลอกข้อความแล้ว" : "ข้อความส่งลูกค้า"}
            </Button>
          </div>
        </div>
        {remoteNote && <p className="mt-2 text-xs text-amber-500">{remoteNote}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard title="รอพัสดุเข้า" value={pendingCount} icon={PackageOpen} gradient="bg-gradient-to-br from-amber-500 to-orange-600" suffix="รายการ" />
        <KpiCard title="ลงทะเบียนวันนี้" value={todayCount} icon={Send} gradient="bg-gradient-to-br from-brand-500 to-brand-700" suffix="รายการ" />
        <KpiCard title="รับเข้าวันนี้" value={receivedToday} icon={PackageCheck} gradient="bg-gradient-to-br from-emerald-glow to-teal-600" suffix="รายการ" />
        <KpiCard title="ทั้งหมด" value={claims.length} icon={Search} gradient="bg-gradient-to-br from-violet-500 to-brand-600" suffix="รายการ" />
      </div>

      <div className="glass-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <label className="min-w-[220px] flex-1">
          <span className="block text-[11px] text-muted-foreground">ค้นหาชื่อ / เบอร์ / เลขพัสดุ / รหัสเคลม</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="วางเลขพัสดุที่เพิ่งเข้ามาได้เลย"
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
          />
        </label>
        <label>
          <span className="block text-[11px] text-muted-foreground">สถานะ</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | ClaimStatus)}
            className="mt-1 rounded-lg border border-border bg-transparent px-2 py-2 text-sm text-foreground outline-none"
          >
            <option value="all" className="bg-popover text-popover-foreground">
              ทั้งหมด
            </option>
            {CLAIM_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">
                {CLAIM_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={handleExport}>
          <Download className="size-4" /> ส่งออก CSV
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="glass-panel overflow-x-auto rounded-2xl p-4">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-2 font-medium">รหัสเคลม</th>
                <th className="pb-2 font-medium">ลูกค้า</th>
                <th className="pb-2 font-medium">เลขพัสดุ</th>
                <th className="pb-2 font-medium">ส่งกลับ</th>
                <th className="pb-2 font-medium">สถานะ</th>
                <th className="pb-2 font-medium">เวลา</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/5",
                    selectedId === c.id && "bg-primary/10"
                  )}
                >
                  <td className="py-2 font-mono text-xs text-foreground">{c.id}</td>
                  <td className="py-2">
                    <p className="text-foreground">{c.customerName}</p>
                    <p className="text-xs text-muted-foreground">{c.phone}</p>
                  </td>
                  <td className="py-2">
                    <p className="font-medium text-foreground">{c.trackingNumber}</p>
                    <p className="text-xs text-muted-foreground">{c.courier}</p>
                  </td>
                  <td className="py-2 text-muted-foreground">{c.returnName}</td>
                  <td className="py-2">
                    <Badge variant="outline" className={statusClass(c.status)}>
                      {CLAIM_STATUS_LABEL[c.status]}
                    </Badge>
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    {claims.length === 0
                      ? "ยังไม่มีรายการ — คัดลอกลิงก์ส่งให้ลูกค้ากรอกก่อนส่งของ"
                      : "ไม่พบรายการที่ตรงกับการค้นหา"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          {!selected ? (
            <p className="py-10 text-center text-sm text-muted-foreground">เลือกรายการทางซ้าย เพื่อคัดลอกข้อมูลและอัปเดตสถานะ</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-semibold text-foreground">{selected.id}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(selected.createdAt)}</p>
                </div>
                <Badge variant="outline" className={statusClass(selected.status)}>
                  {CLAIM_STATUS_LABEL[selected.status]}
                </Badge>
              </div>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] text-muted-foreground">ลูกค้า</dt>
                  <dd className="text-foreground">
                    {selected.customerName} · {selected.phone}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">ที่อยู่ผู้ส่ง</dt>
                  <dd className="whitespace-pre-wrap text-foreground">{selected.senderAddress}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">เลขพัสดุ</dt>
                  <dd className="text-foreground">
                    {selected.trackingNumber} ({selected.courier})
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">ที่อยู่ส่งกลับ</dt>
                  <dd className="whitespace-pre-wrap text-foreground">
                    {selected.returnName} · {selected.returnPhone}
                    {"\n"}
                    {selected.returnAddress}
                  </dd>
                </div>
                {(selected.brand || selected.model || selected.serialNumber) && (
                  <div>
                    <dt className="text-[11px] text-muted-foreground">สินค้า</dt>
                    <dd className="text-foreground">
                      {[selected.brand, selected.model].filter(Boolean).join(" / ")}
                      {selected.serialNumber ? ` · SN ${selected.serialNumber}` : ""}
                    </dd>
                  </div>
                )}
                {selected.issue && (
                  <div>
                    <dt className="text-[11px] text-muted-foreground">อาการ/เหตุผล</dt>
                    <dd className="text-foreground">{selected.issue}</dd>
                  </div>
                )}
              </dl>
              <label className="block">
                <span className="text-[11px] text-muted-foreground">หมายเหตุแอดมิน</span>
                <textarea
                  value={adminNoteDraft}
                  onChange={(e) => setAdminNoteDraft(e.target.value)}
                  onBlur={() => {
                    if (adminNoteDraft.trim() !== (selected.adminNote || "")) {
                      void handleStatus(selected, selected.status)
                    }
                  }}
                  className="mt-1 min-h-16 w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none"
                  placeholder="เช่น กล่องบุบ, รออะไหล่"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleCopyRow(selected)}>
                  {copied === "row" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                  {copied === "row" ? "คัดลอกแล้ว" : "คัดลอกข้อมูล"}
                </Button>
              </div>
              <label className="block">
                <span className="text-[11px] text-muted-foreground">อัปเดตสถานะ</span>
                <select
                  value={selected.status}
                  onChange={(e) => void handleStatus(selected, e.target.value as ClaimStatus)}
                  className="mt-1 w-full rounded-lg border border-border bg-transparent px-2 py-2 text-sm text-foreground outline-none"
                >
                  {CLAIM_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-popover text-popover-foreground">
                      {CLAIM_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
