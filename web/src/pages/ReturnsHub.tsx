import { useMemo } from "react"
import { Ban, CalendarRange, Hourglass, ListChecks, PackageSearch, PackageX, Wallet } from "lucide-react"
import { useCancelledQuery, useFocusQuery, useRefundsQuery, useRestockQuery } from "@/api/queries"
import { ClampText } from "@/components/common/ClampText"
import { Tabs } from "@/components/ui/Tabs"
import { Backlog } from "@/pages/Backlog"
import { CancelledView, CancelledWarning } from "@/pages/Cancelled"
import { TimelineOverview } from "@/pages/CancelReturnTimeline"
import { RefundsView } from "@/pages/ReturnsRefunds"
import { RestockView } from "@/pages/ReturnsRestock"
import { ReturnSummary } from "@/pages/ReturnSummary"

const num = (n: number) => n.toLocaleString("th-TH")
const withCount = (label: string, count: number | undefined) => (count === undefined ? label : `${label} (${num(count)})`)

type HubTab = "backlog" | "deducted" | "not-deducted" | "restock" | "refunds" | "summary" | "overview"

/** The one page for everything about cancelled, returned and lost goods, all from the gv-returns-sync workbook.
 * Tabs sit under four sub-headings: the work to do (backlog queues), cancelled orders (stock already deducted / not yet),
 * returned goods (still to stock in / lost and refunds), and the report by month or day. */
function CaseWorkPage({ initialTab }: { initialTab: HubTab }) {
  const { data: focusData } = useFocusQuery()
  const { data: restockData } = useRestockQuery()
  const { data: refundsData } = useRefundsQuery()
  const { data: cancelledData } = useCancelledQuery()
  const report = cancelledData?.cancelledOrders ?? null
  const rows = useMemo(() => report?.rows ?? [], [report])
  const deducted = useMemo(() => rows.filter((r) => r.stockDeducted), [rows])
  const notDeducted = useMemo(() => rows.filter((r) => !r.stockDeducted), [rows])
  const todayIso = cancelledData?.todayDate ?? ""
  const duplicatesDropped = report?.duplicatesDropped ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="page-heading text-xl font-extrabold text-foreground">งานค้าง · ยกเลิก · ตีกลับ</h2>
        <ClampText className="mt-1 text-sm text-muted-foreground">
          งานที่ต้องทำ สินค้ายกเลิก สินค้าตีกลับ และรายงานตามช่วงเวลา รวมไว้ในหน้าเดียว เลือกหัวข้อย่อยด้านล่าง
        </ClampText>
      </div>
      {cancelledData && <CancelledWarning report={report} />}
      <Tabs
        initialKey={initialTab}
        items={[
          {
            key: "backlog",
            group: "งานที่ต้องทำ",
            label: withCount("งานค้างที่ต้องทำ", focusData?.focus?.rows.length),
            icon: ListChecks,
            render: () => <Backlog key="backlog" />,
          },
          {
            key: "deducted",
            group: "สินค้ายกเลิก",
            label: withCount("ตัดสต็อกแล้ว", report ? deducted.length : undefined),
            icon: Ban,
            render: () => (
              <CancelledView
                key="deducted"
                rows={deducted}
                todayIso={todayIso}
                kindLabel="ตัดสต็อกแล้ว"
                description="ออเดอร์ที่ยกเลิกหลังตัดสต็อก ต้องรับของคืนเข้าคลัง"
                duplicatesDropped={duplicatesDropped}
              />
            ),
          },
          {
            key: "not-deducted",
            group: "สินค้ายกเลิก",
            label: withCount("ยังไม่ตัดสต็อก", report ? notDeducted.length : undefined),
            icon: Hourglass,
            render: () => (
              <CancelledView
                key="not-deducted"
                rows={notDeducted}
                todayIso={todayIso}
                kindLabel="ยังไม่ตัดสต็อก"
                description="ออเดอร์ที่ยกเลิกก่อนตัดสต็อก ต้องเก็บของกลับเข้าที่"
                duplicatesDropped={duplicatesDropped}
              />
            ),
          },
          {
            key: "restock",
            group: "สินค้าตีกลับ",
            label: withCount("ของคืนที่ค้าง", restockData?.restock?.rows.length),
            icon: PackageSearch,
            render: () => <RestockView key="restock" />,
          },
          {
            key: "refunds",
            group: "สินค้าตีกลับ",
            label: withCount("สูญหาย / เงินคืน", refundsData?.refunds?.rows.length),
            icon: PackageX,
            render: () => <RefundsView key="refunds" />,
          },
          {
            key: "summary",
            group: "รายงาน",
            label: "สรุปตีกลับและเงินคืน",
            icon: Wallet,
            render: () => <ReturnSummary key="summary" />,
          },
          {
            key: "overview",
            group: "รายงาน",
            label: "ภาพรวมตามช่วงเวลา",
            icon: CalendarRange,
            render: () => <TimelineOverview key="overview" />,
          },
        ]}
      />
    </div>
  )
}

/** Opens on the backlog (menu entry "งานค้าง/ตีกลับ" and the overview's backlog link). */
export function BacklogHub() {
  return <CaseWorkPage initialTab="backlog" />
}

/** Opens on the returns still to stock in (the overview's returns links). */
export function ReturnsStockHub() {
  return <CaseWorkPage initialTab="restock" />
}

/** Opens on the cancelled orders with stock deducted (old "สินค้ายกเลิก" links). */
export function CancelledHub() {
  return <CaseWorkPage initialTab="deducted" />
}

/** Opens on the summary report (the old "รายงานยกเลิก/ตีกลับ" entry now leads to the report group). */
export function ReportHub() {
  return <CaseWorkPage initialTab="summary" />
}
