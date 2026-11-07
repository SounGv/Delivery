import { PackageSearch, PackageX } from "lucide-react"
import { useRefundsQuery, useRestockQuery } from "@/api/queries"
import { Tabs } from "@/components/ui/Tabs"
import { RefundsView } from "@/pages/ReturnsRefunds"
import { RestockView } from "@/pages/ReturnsRestock"

const num = (n: number) => n.toLocaleString("th-TH")
const withCount = (label: string, count: number | undefined) => (count === undefined ? label : `${label} (${num(count)})`)

/** "สินค้าตีกลับ": two views that both follow the gv-returns-sync workbook, so the totals can be
 * checked against its own tabs — what is still waiting to be stocked in (cn-restock), and the
 * lost/bounced parcels with whether the money came back (ได้เงินคืนแล้ว-พัสดุหาย). The earlier view
 * built from this workbook's DB_RETURN_CURRENT was removed on purpose: its counts did not match
 * the sheet the team uses. */
export function Returns() {
  const { data: restockData } = useRestockQuery()
  const { data: refundsData } = useRefundsQuery()
  return (
    <Tabs
      items={[
        {
          key: "restock",
          label: withCount("ค้างตามชีต gv-returns-sync", restockData?.restock?.rows.length),
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
