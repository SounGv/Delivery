import { useEffect } from "react"
import { Printer, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OtSlip } from "./OtSlip"
import { useSettings } from "@/lib/settingsContext"
import type { OtRecord } from "@/lib/ot"

function docNoFor(record: OtRecord): string {
  return `OT-${record.date.replace(/-/g, "")}-${Array.from(record.employeeName).reduce((a, c) => a + c.charCodeAt(0), 0) % 1000}`
}

export function OtSlipModal({ record, onClose }: { record: OtRecord; onClose: () => void }) {
  const { companyName, logoDataUrl } = useSettings()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const handlePrint = () => {
    document.body.classList.add("ot-printing")
    window.print()
    document.body.classList.remove("ot-printing")
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto bg-black/60 p-4 backdrop-blur-sm print:bg-white print:p-0">
      <div className="mx-auto flex w-full max-w-[210mm] items-center justify-between gap-2 py-2 print:hidden">
        <p className="text-sm font-medium text-white">ใบ OT · {record.employeeName}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={handlePrint}>
            <Printer className="size-4" /> พิมพ์ / Export PDF
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            <X className="size-4" /> ปิด
          </Button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[210mm] rounded-lg shadow-2xl">
        <OtSlip record={record} companyName={companyName} logoDataUrl={logoDataUrl} docNo={docNoFor(record)} />
      </div>
    </div>
  )
}
