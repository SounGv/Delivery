import { RestockView } from "@/pages/ReturnsRestock"

/** "สินค้าตีกลับ": follows the gv-returns-sync workbook's own count (its cn-restock tab — what
 * the team works from, cancelled orders and abnormal bounces included). The earlier view built
 * from this workbook's DB_RETURN_CURRENT was removed on purpose: its counts did not match the
 * sheet the team uses. */
export function Returns() {
  return <RestockView />
}
