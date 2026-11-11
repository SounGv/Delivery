import { ListChecks, PackageSearch, PackageX } from "lucide-react"
import { useFocusQuery, useRefundsQuery, useRestockQuery } from "@/api/queries"
import { Tabs } from "@/components/ui/Tabs"
import { Backlog } from "@/pages/Backlog"
import { RefundsView } from "@/pages/ReturnsRefunds"
import { RestockView } from "@/pages/ReturnsRestock"

const num = (n: number) => n.toLocaleString("th-TH")
const withCount = (label: string, count: number | undefined) => (count === undefined ? label : `${label} (${num(count)})`)

type HubTab = "backlog" | "restock" | "refunds"

/** One menu entry for everything the warehouse team has to chase on returns, all from the gv-returns-sync workbook:
 * the backlog they have to work through (queues from the "โฟกัสทีม-งานค้าง" tab), what is still waiting to be stocked in
 * (cn-restock), and the lost/bounced parcels with whether the money came back. The backlog tab comes first. */
function ReturnsHub({ initialTab }: { initialTab: HubTab }) {
  const { data: focusData } = useFocusQuery()
  const { data: restockData } = useRestockQuery()
  const { data: refundsData } = useRefundsQuery()
  return (
    <Tabs
      initialKey={initialTab}
      items={[
        {
          key: "backlog",
          label: withCount("งานค้างที่ต้องทำ", focusData?.focus?.rows.length),
          icon: ListChecks,
          render: () => <Backlog key="backlog" />,
        },
        {
          key: "restock",
          label: withCount("ของคืน/ตีกลับที่ค้าง", restockData?.restock?.rows.length),
          icon: PackageSearch,
          render: () => <RestockView key="restock" />,
        },
        {
          key: "refunds",
          label: withCount("สูญหาย / เงินคืน", refundsData?.refunds?.rows.length),
          icon: PackageX,
          render: () => <RefundsView key="refunds" />,
        },
      ]}
    />
  )
}

/** Opens on the backlog tab (menu entry "งานค้าง/ตีกลับ", and the overview's backlog link). */
export function BacklogHub() {
  return <ReturnsHub initialTab="backlog" />
}

/** Opens on the "ของคืน/ตีกลับที่ค้าง" tab (the overview's returns links). */
export function ReturnsStockHub() {
  return <ReturnsHub initialTab="restock" />
}
